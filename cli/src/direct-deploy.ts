// Deploys SealedBidAuction to a given network without going through
// @midnight-ntwrk/testkit-js's docker-compose-managed RemoteTestEnvironment
// (which starts its own ephemeral proof-server container per run, and whose
// wallet-sync checks can hang indefinitely - see wallet-utils.ts). Instead
// this expects a proof server you started yourself, e.g.:
//
//   docker compose -f proof-server-local.yml up -d

import { WebSocket } from 'ws';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId, getNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { type EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';

import {
  CompiledSealedBidAuctionContractContract,
  createSealedBidAuctionPrivateState,
  ledger,
} from '@sealed-bid-auction/contract';
import { sealedBidAuctionPrivateStateKey, type PrivateStateId, type SealedBidAuctionProviders } from './common-types.js';
import { createLogger } from './logger-utils.js';
import { MidnightWalletProvider } from './midnight-wallet-provider.js';
import { syncWallet, waitForUnshieldedFunds } from './wallet-utils.js';
import { generateDust } from './generate-dust.js';

// @ts-expect-error: needed to enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

const ITEM_DESCRIPTION = process.env.ITEM_DESCRIPTION ?? 'Sealed-Bid Auction demo deployment';
const RESERVE_PRICE = BigInt(process.env.RESERVE_PRICE ?? '100');
const REQUIRED_DEPOSIT = BigInt(process.env.REQUIRED_DEPOSIT ?? '500');

export type DeployNetwork = 'preview' | 'preprod' | 'local';

// 'local' targets the official midnight-local-dev stack (node + indexer +
// proof server on localhost, networkId 'undeployed') - see
// https://docs.midnight.network/guides/midnight-local-network. No faucet
// involved: fund a wallet there via its own `--fund-config` accounts.json
// (or its interactive menu) and pass that account's mnemonic here via
// WALLET_MNEMONIC.
const ENV_CONFIGS: Record<DeployNetwork, EnvironmentConfiguration> = {
  preview: {
    walletNetworkId: 'preview',
    networkId: 'preview',
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
    nodeWS: 'wss://rpc.preview.midnight.network',
    faucet: 'https://midnight-tmnight-preview.nethermind.dev/',
    proofServer: 'http://localhost:6300',
  },
  preprod: {
    walletNetworkId: 'preprod',
    networkId: 'preprod',
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    nodeWS: 'wss://rpc.preprod.midnight.network',
    faucet: 'https://midnight-tmnight-preprod.nethermind.dev/',
    proofServer: 'http://localhost:6300',
  },
  local: {
    walletNetworkId: 'undeployed',
    networkId: 'undeployed',
    indexer: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
    node: 'http://127.0.0.1:9944',
    nodeWS: 'ws://127.0.0.1:9944',
    // No faucet on local - waitForUnshieldedFunds is called with
    // fundFromFaucet=false for this network, so this is never used.
    faucet: '',
    proofServer: 'http://127.0.0.1:6300',
  },
};

export const deployDirect = async (network: DeployNetwork): Promise<void> => {
  const envConfiguration = ENV_CONFIGS[network];
  setNetworkId(envConfiguration.networkId as NetworkId);

  const logger = await createLogger(`../logs/${network}-direct/${new Date().toISOString()}.log`);

  // If WALLET_MNEMONIC/WALLET_SEED is set, import that wallet instead of
  // generating a fresh random one (useful when you already funded a
  // specific wallet via the faucet UI). Never pass real/mainnet-holding
  // seeds this way - this script logs the derived master seed and stores
  // private state on disk.
  const mnemonic = process.env.WALLET_MNEMONIC;
  const seedOverride = process.env.WALLET_SEED;
  logger.info(
    mnemonic
      ? `Importing wallet from WALLET_MNEMONIC for ${network}...`
      : seedOverride
        ? `Importing wallet from WALLET_SEED for ${network}...`
        : `Building a fresh wallet for ${network}...`,
  );
  const walletProvider = mnemonic
    ? await MidnightWalletProvider.build(logger, envConfiguration, undefined, mnemonic)
    : await MidnightWalletProvider.build(logger, envConfiguration, seedOverride ?? toHex(randomBytes(32)));
  const seed = walletProvider.masterSeedHex;
  await walletProvider.start();

  // No faucet on 'local' - fund the account beforehand via midnight-local-dev
  // itself (its --fund-config accounts.json, or its interactive menu), then
  // pass that account's mnemonic here via WALLET_MNEMONIC. This just checks
  // the balance that's already there.
  logger.info(
    network === 'local'
      ? 'Checking balance (fund via midnight-local-dev first, not a faucet)...'
      : 'Requesting funds from the faucet and waiting for balance...',
  );
  const unshieldedState = await waitForUnshieldedFunds(
    logger,
    walletProvider.wallet,
    envConfiguration,
    unshieldedToken(),
    network !== 'local',
  );
  const nightBalance = unshieldedState.balances[unshieldedToken().raw];
  logger.info(`NIGHT balance: ${nightBalance}`);

  logger.info('Registering NIGHT UTXOs for DUST generation (needed to pay tx fees)...');
  await generateDust(logger, seed, unshieldedState, walletProvider.wallet);
  // Always wait for a full (shielded + unshielded + dust) sync before
  // spending - generateDust only waits for a positive DUST *balance*, which
  // can be true before the DUST lane's merkle-tree/witness state used to
  // build a valid spend proof has finished syncing, especially for a wallet
  // address with a long prior transaction history. Building the deploy
  // transaction against a not-fully-synced dust lane produces a proof the
  // chain rejects as invalid, even though the balance already looked ready.
  await syncWallet(logger, walletProvider.wallet);

  const zkConfigProvider = new NodeZkConfigProvider<'placeBid' | 'closeAuction' | 'resolveAuction'>(
    new URL('../../contract/src/managed/sealed-bid-auction', import.meta.url).pathname,
  );
  const providers: SealedBidAuctionProviders = {
    privateStateProvider: levelPrivateStateProvider<PrivateStateId, ReturnType<typeof createSealedBidAuctionPrivateState>>({
      privateStateStoreName: `sealed-bid-auction-private-state-${network}`,
      signingKeyStoreName: `sealed-bid-auction-private-state-${network}-signing-keys`,
      privateStoragePasswordProvider: () => 'SealedBidAuction-Test-2026!',
      accountId: seed,
    }),
    publicDataProvider: indexerPublicDataProvider(envConfiguration.indexer, envConfiguration.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(envConfiguration.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };

  logger.info(
    `Deploying SealedBidAuction to ${network}: "${ITEM_DESCRIPTION}" (reserve ${RESERVE_PRICE}, required deposit ${REQUIRED_DEPOSIT})...`,
  );
  const deployed = await deployContract(providers, {
    compiledContract: CompiledSealedBidAuctionContractContract,
    privateStateId: sealedBidAuctionPrivateStateKey,
    initialPrivateState: createSealedBidAuctionPrivateState(randomBytes(32), 0n, randomBytes(32)),
    args: [ITEM_DESCRIPTION, RESERVE_PRICE, REQUIRED_DEPOSIT],
  });
  const contractAddress = deployed.deployTxData.public.contractAddress;
  logger.info(`✅ Deployed contract at address: ${contractAddress}`);

  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  logger.info(`Ledger state right after deploy: ${JSON.stringify(contractState != null ? ledger(contractState.data) : null, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`);

  logger.info(`Your wallet seed (save this to reconnect/settle later): ${seed}`);

  await walletProvider.stop();
  logger.info('Done.');
  process.exit(0);
};

import type { ResourceIdentifier } from '../http/representation/ResourceIdentifier';
import { getLoggerFor } from '../logging/LogUtil';
import type { ResourcesGenerator } from '../pods/generate/ResourcesGenerator';
import type { KeyValueStorage } from '../storage/keyvalue/KeyValueStorage';
import type { ResourceStore } from '../storage/ResourceStore';
import { createErrorMessage } from '../util/errors/ErrorUtil';
import { ensureTrailingSlash, joinUrl, joinFilePath, resolveAssetPath } from '../util/PathUtil';
import { Initializer } from './Initializer';

import { promises as fsPromises } from 'fs';

export interface ContainerInitializerArgs {
  /**
   * Base URL of the server.
   */
  baseUrl: string;
  /**
   * Relative path of the container.
   */
  path: string;
  /**
   * ResourceStore where the container should be stored.
   */
  store: ResourceStore;
  /**
   * Generator that should be used to generate container contents.
   */
  generator: ResourcesGenerator;
  /**
   * Key that is used to store the boolean in the storage indicating the container is initialized.
   */
  storageKey: string;
  /**
   * Used to store initialization status.
   */
  storage: KeyValueStorage<string, boolean>;
  rootFilePath?: string;
  accountFolder?: string;
  webIdSuffix?: string;
}

/**
 * Initializer that sets up a container.
 * Will copy all the files and folders in the given path to the corresponding documents and containers.
 */
export class ContainerInitializer extends Initializer {
  protected readonly logger = getLoggerFor(this);

  private readonly baseUrl: string;
  private readonly store: ResourceStore;
  private readonly containerId: ResourceIdentifier;
  private readonly generator: ResourcesGenerator;
  private readonly storageKey: string;
  private readonly storage: KeyValueStorage<string, boolean>;
  private readonly rootFilePath: string | undefined;
  private readonly accountFolder: string;
  private readonly webIdSuffix: string | undefined;

  public constructor(args: ContainerInitializerArgs) {
    super();
    this.baseUrl = ensureTrailingSlash(args.baseUrl);
    this.containerId = { path: ensureTrailingSlash(joinUrl(args.baseUrl, args.path)) };
    this.store = args.store;
    this.generator = args.generator;
    this.storageKey = args.storageKey;
    this.storage = args.storage;
    this.rootFilePath = args.rootFilePath;
    this.accountFolder = resolveAssetPath(args.accountFolder);
    this.webIdSuffix = args.webIdSuffix;
  }

  public async handle(): Promise<void> {
    this.logger.info(`Initializing container ${this.containerId.path}`);
    const webId = this.webIdSuffix ? joinUrl(this.baseUrl, this.webIdSuffix) : undefined;
    const resources = this.generator.generate(this.containerId, { webId, oidcIssuer: this.baseUrl });
    let count = 0;
    for await (const { identifier: resourceId, representation } of resources) {
      try {
        await this.store.setRepresentation(resourceId, representation);
        count += 1;
      } catch (error: unknown) {
        this.logger.warn(`Failed to create resource ${resourceId.path}: ${createErrorMessage(error)}`);
      }
    }
    this.logger.info(`Initialized container ${this.containerId.path} with ${count} resources.`);

    if(this.rootFilePath){
      const files = await fsPromises.readdir(this.accountFolder);
      if(files.length){
        await fsPromises.mkdir(joinFilePath(this.rootFilePath, '.internal/accounts'));
        for (const name of files) {
          await fsPromises.copyFile(
            joinFilePath(this.accountFolder, name),
            joinFilePath(this.rootFilePath, '.internal/accounts', name),
          );
        }
      }
    }

    // Mark the initialization as finished
    await this.storage.set(this.storageKey, true);
  }
}

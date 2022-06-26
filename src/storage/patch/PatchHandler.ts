import type { Patch } from '../../http/representation/Patch';
import type { RepresentationPreferences } from '../../http/representation/RepresentationPreferences';
import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import { AsyncHandler } from '../../util/handlers/AsyncHandler';
import type { ResourceStore } from '../ResourceStore';

export type PatchHandlerInput<T extends ResourceStore = ResourceStore> = {
  source: T;
  identifier: ResourceIdentifier;
  patch: Patch;
  preferences?: RepresentationPreferences;
};

/**
 * Executes the given Patch.
 */
export abstract class PatchHandler<T extends ResourceStore = ResourceStore>
  extends AsyncHandler<PatchHandlerInput<T>, ResourceIdentifier[]> {}

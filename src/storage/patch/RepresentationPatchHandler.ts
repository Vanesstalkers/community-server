import type { Representation } from '../../http/representation/Representation';
import { RepresentationMetadata } from '../../http/representation/RepresentationMetadata';
import type { RepresentationPreferences } from '../../http/representation/RepresentationPreferences';
import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import { getLoggerFor } from '../../logging/LogUtil';
import { NotFoundHttpError } from '../../util/errors/NotFoundHttpError';
import type { PatchHandlerInput } from './PatchHandler';
import { PatchHandler } from './PatchHandler';
import type { RepresentationPatcher } from './RepresentationPatcher';

import { FileDataAccessor } from '../accessors/FileDataAccessor';
import { ExtensionBasedMapper } from '../mapping/ExtensionBasedMapper';
import type { SparqlUpdatePatch } from '../../http/representation/SparqlUpdatePatch';

/**
 * Handles a patch operation by getting the representation from the store, applying a `RepresentationPatcher`,
 * and then writing the result back to the store.
 *
 * In case there is no original representation (the store throws a `NotFoundHttpError`),
 * the patcher is expected to create a new one.
 */
export class RepresentationPatchHandler extends PatchHandler {
  protected readonly logger = getLoggerFor(this);

  private readonly patcher: RepresentationPatcher;

  public constructor(patcher: RepresentationPatcher) {
    super();
    this.patcher = patcher;
  }

  public async handle({ source, patch, identifier, preferences }: PatchHandlerInput): Promise<ResourceIdentifier[]> {
    // Get the representation from the store
    let representation: Representation | undefined;
    try {
      representation = await source.getRepresentation(identifier, {});
    } catch (error: unknown) {
      // Solid, §5.1: "When a successful PUT or PATCH request creates a resource,
      // the server MUST use the effective request URI to assign the URI to that resource."
      // https://solid.github.io/specification/protocol#resource-type-heuristics
      if (!NotFoundHttpError.isInstance(error)) {
        throw error;
      }
      this.logger.debug(`Patching new resource ${identifier.path}`);
    }

    // Patch it
    const patched = await this.patcher.handleSafe({ patch, identifier, representation });
    // тут видно кого патчим

    try{
      const accessor = new FileDataAccessor(
        new ExtensionBasedMapper('http://localhost:3001', './.data')
      );
      const algebra = (patch as SparqlUpdatePatch).algebra;
      const predicate = 'http://zteq.com/ac/0.1/secureOff';
      if(algebra){
        
        const deleteData =
          algebra.updates?.find((item: any)=>item.delete)?.delete
          || algebra.delete
          || {};
        const secureResources = Object.values(deleteData)
          .filter((quad: any) => quad.predicate.value === predicate)
          .map((quad: any) => quad.object.value);
        for(const path of secureResources){
          const id:ResourceIdentifier = { path };
          const data = await accessor.getData(id, {secure: {'enable': 0}});
          await accessor.writeDocument(id, data, new RepresentationMetadata(id));
        }
        
        const insertData =
          algebra.updates?.find((item: any)=>item.insert)?.insert
          || algebra.insert
          || {};
        const unsecureResources = Object.values(insertData)
          .filter((quad: any) =>{
            return quad.predicate.value === predicate;
          })
          .map((quad: any) => quad.object.value);
        for(const path of unsecureResources){
          const id:ResourceIdentifier = { path };
          const data = await accessor.getData(id);
          await accessor.writeDocument(id, data, new RepresentationMetadata(id), {secure: {'enable': 0}});
        }
      }
    }catch(err){
      console.log(err);
    }
    this.logger.debug(`Patching new resource ${identifier.path}`);

    // Write it back to the store
    return source.setRepresentation(identifier, patched, undefined, preferences);
  }
}

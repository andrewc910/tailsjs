import { CompilerPlugin } from "../types.ts";
import rewriteImportPath from "./plugins/rewriteImportPaths.ts";
import css from "./plugins/css.ts";

const plugins = [rewriteImportPath, css];

export function forEach(callback: (plugin: CompilerPlugin) => void) {
  return plugins.forEach((plugin) => callback(plugin));
}

/**
 * Handles iterating through all modules passing the module & key
 * into plugin.preTransform.
 *
 * @param modules
 */
export async function preTransform(modules: Record<string, string>) {
  const transformedModules: Record<string, string> = {};

  for await (const moduleKey of Object.keys(modules)) {
    const content = modules[moduleKey];

    for await (const plugin of plugins) {
      if (moduleKey.match(plugin.test) && plugin.preTransform) {
        const { transformedPath, transformedContent } = await plugin
          .preTransform(
            moduleKey,
            content,
          );
        transformedModules[transformedPath] = transformedContent;
        continue;
      }

      transformedModules[moduleKey] = content;
    }
  }

  return transformedModules;
}

/**
 * Handles iterating through all modules passing the module & key
 * into plugin.postTransform.
 *
 * @param modules
 */
export async function postTransform(
  modules: Record<string, Deno.TranspileOnlyResult>,
) {
  const transformedModules: Record<string, Deno.TranspileOnlyResult> = {};

  for await (const moduleKey of Object.keys(modules)) {
    const module = modules[moduleKey];

    for await (const plugin of plugins) {
      if (moduleKey.match(plugin.test) && plugin.postTransform) {
        const { transformedPath, transformedModule } = await plugin
          .postTransform(
            moduleKey,
            module,
          );
        transformedModules[transformedPath] = transformedModule;
        continue;
      }

      transformedModules[moduleKey] = module;
    }
  }

  return transformedModules;
}
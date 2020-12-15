import { walk } from "../std.ts";
import { Modules } from "../types.ts";
import { ensureTextFile } from "../fs.ts";
import { reModuleExt } from "../core/utils.ts";
import { ModuleHandler } from "../core/module_handler.ts";

async function compile(
  path: string,
  moduleHandler: ModuleHandler,
  assetDir: string,
): Promise<void> {
  const [diagnostics, bundle] = await Deno.compile(path);

  if (diagnostics) {
    console.log(diagnostics);
    throw new Error(`Could not compile ${path}`);
  }

  Object.keys(bundle)
    .forEach((moduleKey: string) => {
      const key = moduleKey.replace(`file://${assetDir}`, "");
      // modules[key] = bundle[moduleKey];
      moduleHandler.set(key, bundle[moduleKey]);
    });
}

async function bundle(
  path: string,
  moduleHandler: Modules,
  assetDir: string,
): Promise<void> {
  const [diagnostics, bundle] = await Deno.bundle(path);

  if (diagnostics) {
    console.log(diagnostics);
    throw new Error(`Could not compile ${path}`);
  }

  const key = path
    .replace(`${assetDir}`, "")
    .replace(reModuleExt, ".js");

  moduleHandler.set(key, bundle);
}

/**
 * Walks the `pages` directory and compiles all files. `Deno.compile` will
 * compile all imports as well. These are injected into `modules`.
 *
 * @param modules
 * @param assetPath
 * @param assetDir
 * @param appRoot
 * @param options
 */
export async function compileApplication(
  moduleHandler: ModuleHandler,
  assetPath: (asset: string) => string,
  assetDir: string,
  appRoot: string,
  options: Record<string, string> = {},
) {
  const walkOptions = {
    includeDirs: true,
    exts: [".js", ".ts", ".mjs", ".jsx", ".tsx"],
    skip: [/^\./, /\.d\.ts$/i, /\.(test|spec|e2e)\.m?(j|t)sx?$/i],
  };

  const { mode } = options;

  // TODO: Transpile conrollers for loading
  // const apiDir = assetPath("controllers");
  // for await (const { path } of walk(apiDir, walkOptions)) {
  //   console.log();
  // }

  const pagesDir = assetPath("pages");
  for await (const { path } of walk(pagesDir, walkOptions)) {
    if (mode === "production") {
      // await bundle(path, moduleHandler, assetDir);
      await compile(path, moduleHandler, assetDir);
    } else {
      await compile(path, moduleHandler, assetDir);
    }
  }

  await moduleHandler.writeAll();
  // await writeFiles(moduleHandler, appRoot);
  if (mode === "production") {
    // TODO: Move files to dist folder
  }
}

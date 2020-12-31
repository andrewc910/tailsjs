import { render } from "../compiler/compiler.ts";
import { ComponentType } from "../deps.ts";
import { ensureTextFile, existsFile } from "../fs.ts";
import { path } from "../std.ts";
// import { Modules } from "../types.ts";
import { Configuration } from "./configuration.ts";
import { reDoubleQuotes, reEsmUrl, reHttp, reImportPath } from "./utils.ts";
import log from "../logger/logger.ts";
import { RouteHandler } from "../controller/route_handler.ts";
import { EventEmitter } from "../hmr/events.ts";
import Module from "../modules/module.ts";
import * as compiler from "../compiler/compiler2.ts";
import utils from "../modules/utils.ts";
import * as renderer from "../modules/renderer.ts";

interface ManifestModule {
  path: string;
  module: string;
  html?: string;
}

interface Manifest {
  [key: string]: ManifestModule;
}

export class ModuleHandler {
  bootstrap: string;
  // deno-lint-ignore no-explicit-any
  appComponent?: ComponentType<any>;
  // deno-lint-ignore no-explicit-any
  documentComponent?: ComponentType<any>;

  readonly modules: Map<string, Module>;
  private manifest: Manifest;
  private readonly config: Configuration;
  private readonly eventListeners: EventEmitter[];

  constructor(config: Configuration) {
    this.config = config;
    this.modules = new Map();
    this.manifest = {};
    this.eventListeners = [];
    this.bootstrap = 'throw new Error("No Bootstrap Content")';
  }

  get appRoot(): string {
    return this.config.appRoot;
  }

  async init(
    options: Record<string, boolean> = { building: false },
  ): Promise<void> {
    // TODO: Make use of config.isBuilding
    if (this.config.mode === "production" && !options.building) {
      await this.loadManifest();
      this.setManifestModules();
      await this.setDefaultComponents();
      return;
    }
  }

  async build(staticRoutes: string[]) {
    const modules = await this.compile();
    await this.setModules(modules, staticRoutes);
    await this.writeAll();
    await this.setDefaultComponents();

    if (this.config.mode === "production") {
      // TODO: Move files to dist folder
    }
  }

  get(key: string): Module | undefined {
    return this.modules.get(key);
  }

  set(key: string, module: Module): void {
    this.modules.set(key, module);
  }

  keys(): IterableIterator<string> {
    return this.modules.keys();
  }

  addEventListener() {
    const e = new EventEmitter();
    this.eventListeners.push(e);
    return e;
  }

  removeEventListener(e: EventEmitter) {
    e.removeAllListeners();
    const index = this.eventListeners.indexOf(e);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  async watch(routeHandler: RouteHandler, staticRoutes: string[]) {
    log.info("Start watching code changes...");

    const watch = Deno.watchFs(this.config.srcDir, { recursive: true });
    let reloading = false;

    for await (const event of watch) {
      if (event.kind === "access" || reloading) continue;

      log.debug(`Event kind: ${event.kind}`);

      if (event.kind !== "modify") continue;

      reloading = true;
      for (const path of event.paths) {
        const startTime = performance.now();
        const fileName = path.split("/").slice(-1)[0];

        log.debug(`Processing ${fileName}`);
        // Check if file was deleted
        if (!existsFile(path)) continue;

        // TODO: Possibly make this 2 event listeners
        await this.recompile(path, staticRoutes);
        await routeHandler.reloadModule(path);

        const cleanPath = path
          .replace(`${this.config.assetDir}`, "")
          .replace(/\.(jsx|mjs|tsx|ts?)/g, ".js");

        this.eventListeners.forEach((eventListener) => {
          eventListener.emit(
            `${event.kind}-${cleanPath}`,
            cleanPath,
          );
        });

        log.debug(
          `Processing completed in ${
            Math.round(performance.now() - startTime)
          }ms`,
        );
      }

      setTimeout(() => (reloading = false), 500);
    }
  }

  private async compile(): Promise<Record<string, Deno.TranspileOnlyResult>> {
    const walkOptions = {
      includeDirs: true,
      exts: [".js", ".ts", ".mjs", ".jsx", ".tsx"],
      skip: [/^\./, /\.d\.ts$/i, /\.(test|spec|e2e)\.m?(j|t)sx?$/i],
    };

    return await compiler.transpileDir(
      this.config.srcDir,
      walkOptions,
    );
  }

  private async setModules(
    modules: Record<string, Deno.TranspileOnlyResult>,
    staticRoutes: string[],
  ) {
    for await (const moduleKey of Object.keys(modules)) {
      const key = utils.cleanKey(moduleKey, this.config.srcDir);

      // TODO: Maybe iterate again and render
      // const html = await utils.renderSSGModule(moduleKey);

      const module = new Module(
        {
          fullpath: moduleKey,
          source: modules[moduleKey].source,
          map: modules[moduleKey].map,
          isStatic: renderer.isStatic(staticRoutes, moduleKey),
        },
      );

      this.modules.set(key, module);
    }
  }

  private async loadManifest(): Promise<void> {
    const path = `${this.appRoot}/.tails/manifest.json`;
    const decoder = new TextDecoder("utf-8");

    try {
      const data = await Deno.readFile(path);
      this.manifest = JSON.parse(decoder.decode(data));
    } catch {
      throw new Error(`Cannot load manifest. Path tried: ${path}`);
    }
  }

  /**
   * Iterate over `this.manifest` and set `this.modules`.
   */
  private setManifestModules(): void {
    Object.keys(this.manifest)
      .forEach((key) => {
        const { module, html } = this.manifest[key];
        // TODO
        // this.set(key, module, html);
      });
  }

  /**
   * Writes all files in `modules` to `${appRoot}/.tails/`
   */
  async writeAll(): Promise<void> {
    await this.writeModules();
    await this.writeManifest();

    if (this.config.mode === "production") {
      // TODO:
      // await this.writeHTML();
      // Copy files to /dist
    }
  }

  private async writeManifest() {
    await ensureTextFile(
      `${this.appRoot}/.tails/manifest.json`,
      JSON.stringify(this.manifest),
    );
  }

  private async writeModules() {
    for await (const key of this.keys()) {
      await this.writeModule(key);
    }
  }

  private async writeModule(key: string) {
    const module = (this.get(key) as Module);
    const writePath = `${this.appRoot}/.tails/src${key}`;

    this.manifest[key] = {
      path: writePath,
      module: module.source as string,
      html: module.html,
    };

    await module.write(writePath);
  }

  // TODO: Move into compiler?
  private async recompile(filePath: string, staticRoutes: string[]) {
    // const modules: Record<string, string> = {};
    // const decoder = new TextDecoder("utf-8");
    // const data = await Deno.readFile(filePath);

    // const key = filePath
    //   .replace(`${this.config.assetDir}`, "");

    // modules[key] = decoder.decode(data);

    // const transpiled = await Deno.transpileOnly(modules);

    // let html;
    // if (filePath.includes("/pages")) {
    //   html = await this.renderHTML(filePath, staticRoutes);
    // }

    // const JSKey = key.replace(/\.(jsx|mjs|tsx|ts|js?)/g, ".js");
    // const sourceMap = transpiled[key].map;

    // this.set(
    //   JSKey,
    //   transpiled[key].source,
    //   html,
    // );
    // if (sourceMap) {
    //   this.set(
    //     `${JSKey}.map`,
    //     sourceMap,
    //   );
    // }

    // this.rewriteImportPath(JSKey);
    // this.rewriteImportPath(`${JSKey}.map`);
    // await this.writeModule(JSKey);
    // await this.writeModule(`${JSKey}.map`);
  }

  private async renderHTML(filePath: string, staticRoutes: string[]) {
    if (
      filePath.includes("_app") || filePath.includes("_document")
    ) {
      return;
    }

    const hasStaticRoute = staticRoutes.filter((route) =>
      filePath.includes(route)
    );
    if (hasStaticRoute.length === 0) return;

    const pagesDir = this.config.assetPath("pages");
    const { default: App } = await import(
      path.join(pagesDir, "_app.tsx")
    );

    const { default: Document } = await import(
      path.join(pagesDir, "_document.tsx")
    );

    // The `Math.random()` is to get around Deno's caching system
    // See: https://github.com/denoland/deno/issues/6946
    return await render(
      `${filePath}?version=${Math.random() + Math.random()}`,
      App,
      Document,
    );
  }

  /**
   * Loads App, Document & bootstrap.js. This MUST be called AFTER
   * `writeAll` as loadXComponent expects the manifest to be built.
   */
  private async setDefaultComponents(): Promise<void> {
    this.appComponent = await this.loadAppComponent();
    this.documentComponent = await this.loadDocumentComponent();
    this.bootstrap = await this.loadBootstrap();
  }

  // deno-lint-ignore no-explicit-any
  private async loadAppComponent(): Promise<ComponentType<any>> {
    const module = this.get("/pages/_app.js");
    if (!module) {
      throw new Error("Could not find _app.js");
    }

    const { writePath } = module;

    try {
      const { default: appComponent } = await import(writePath as string);
      return appComponent;
    } catch (err) {
      console.log(err);
      throw new Error(`Failed to import _app.js. Path: ${writePath}`);
    }
  }

  // deno-lint-ignore no-explicit-any
  private async loadDocumentComponent(): Promise<ComponentType<any>> {
    const module = this.get("/pages/_document.js");
    if (!module) {
      throw new Error("Could not find _document.js");
    }

    const { writePath } = module;

    try {
      const { default: documentComponent } = await import(writePath as string);

      return documentComponent;
    } catch (err) {
      console.log(err);
      throw new Error(`Failed to import _document.js. Path: ${writePath}`);
    }
  }

  /**
   * Load boostrap file
   */
  private async loadBootstrap(): Promise<string> {
    const decoder = new TextDecoder("utf-8");
    const data = await Deno.readFile(
      path.resolve("./") + "/browser/bootstrap.js",
    );

    return decoder.decode(data);
  }
}

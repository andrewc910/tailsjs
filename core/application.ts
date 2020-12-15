import { existsDirSync } from "../fs.ts";
import log from "../logger/logger.ts";
import { ensureDir, path } from "../std.ts";
import { version } from "../version.ts";
import { Configuration } from "./configuration.ts";
import { AssetHandler } from "./asset_handler.ts";
import { Modules } from "../types.ts";
import { compileApplication } from "../compiler/compiler.ts";
import { ModuleHandler } from "./module_handler.ts";

export class Application {
  readonly config: Configuration;
  readonly appRoot: string;
  readonly moduleHandler: ModuleHandler;
  private readonly assetHandler: AssetHandler;
  private readonly mode: "test" | "development" | "production";
  private readonly reload: boolean;

  constructor(
    appDir: string,
    mode: "test" | "development" | "production",
    reload = false,
  ) {
    this.appRoot = path.resolve(appDir);
    this.mode = mode;
    this.reload = reload;
    this.config = new Configuration(appDir, mode);
    this.assetHandler = new AssetHandler(this.config);
    this.moduleHandler = new ModuleHandler(this.assetHandler, mode);
  }

  // get isDev() {
  //   return this.mode === "development";
  // }

  get buildDir() {
    return path.join(
      this.appRoot,
      ".tails",
      this.mode + "." + this.config.buildTarget,
    );
  }

  get routers() {
    return this.assetHandler.serverRouters;
  }

  async ready() {
    const startTime = performance.now();

    await this.config.loadConfig();
    await this.init(this.reload);
    await this.moduleHandler.init();
    await this.assetHandler.init(this.moduleHandler);

    log.info(
      "Project loaded in " + Math.round(performance.now() - startTime) + "ms",
    );
  }

  async build() {
    const startTime = performance.now();

    await this.config.loadConfig({ building: true });
    await this.moduleHandler.init({ building: true });

    log.info(
      "Project built in " + Math.round(performance.now() - startTime) + "ms",
    );
  }

  async start() {
    const startTime = performance.now();
    await this.config.loadConfig();
    await this.moduleHandler.init();
    await this.assetHandler.init(this.moduleHandler);

    log.info(
      "Project started in " + Math.round(performance.now() - startTime) + "ms",
    );
  }

  private async init(reload: boolean) {
    const pagesDir = path.join(this.appRoot, "src/pages");

    if (!(existsDirSync(pagesDir))) {
      log.fatal(`'pages' directory not found.`);
    }

    if (reload) {
      if (existsDirSync(this.buildDir)) {
        await Deno.remove(this.buildDir, { recursive: true });
      }

      await ensureDir(this.buildDir);
    }

    if (this.config.isDev) {
      // this._watch();
    }
  }
}

import { info } from "@girae/common/logger"
import { readdirSync } from "fs"
import { join, relative } from "path"

// Base for anything that dynamically import()s every file under a directory at commandeer
// startup (currently commands and hooks) - owns the "recursively scan a directory, import()
// each file, log how many loaded" primitive so it isn't reimplemented per loader.
export abstract class Loadable {
  protected abstract readonly label: string

  protected async importAll(dirPath: string): Promise<{ file: string; module: any }[]> {
    const dirents = readdirSync(dirPath, { recursive: true, withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith(".ts"))
    const fullPaths = dirents.map(e => join((e as any).parentPath ?? (e as any).path, e.name))
    const modules = await Promise.all(fullPaths.map(p => import(p).then(m => m.default)))
    return fullPaths.map((fullPath, i) => ({ file: relative(dirPath, fullPath), module: modules[i] }))
  }

  protected logLoaded(count: number) {
    info("commandeer", `Loaded ${count} ${this.label}`)
  }
}

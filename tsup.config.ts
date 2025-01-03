import { defineConfig, Options } from "tsup";

const commonConfig: Options = {
  clean: true,
  dts: true,
  splitting: false,
  tsconfig: "tsconfig.prod.json",
};

export default defineConfig([
  {
    ...commonConfig,
    entry: ["src/**/*"],
    bundle: false,
    outDir: "dist/cjs",
    format: ["cjs"],
  },
  {
    ...commonConfig,
    entry: ["src/**/*"],
    bundle: false,
    outDir: "dist/esm",
    format: ["esm"],
  },
]);

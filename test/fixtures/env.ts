import * as path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import _ from "lodash";
import {afterAll, vi} from "vitest";
const home = path.join(process.cwd(), "test", "fixtures", ".thelounge");

import config from "../../server/config";

// This file runs before every test file, and test files may share one module cache per worker:
// each file starts from the same config, and its spies, stubs and fake timers end with it
const state = globalThis as typeof globalThis & {pristineConfig?: typeof config.values};

if (state.pristineConfig) {
	for (const key of Object.keys(config.values)) {
		delete config.values[key];
	}

	Object.assign(config.values, _.cloneDeep(state.pristineConfig));
}

config.setHome(home);
state.pristineConfig ??= _.cloneDeep(config.values);

afterAll(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

// Several test files wipe the preview cache, so each file gets its own
const previewCachePath = path.join(os.tmpdir(), `thelounge-previews-${crypto.randomUUID()}`);
config.getPreviewCachePath = () => previewCachePath;
afterAll(() => fs.rmSync(previewCachePath, {recursive: true, force: true}));

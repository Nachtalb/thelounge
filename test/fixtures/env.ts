import * as path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import {afterAll} from "vitest";
const home = path.join(process.cwd(), "test", "fixtures", ".thelounge");

import config from "../../server/config";
config.setHome(home);

// Several test files wipe the preview cache, so each file gets its own
const previewCachePath = path.join(os.tmpdir(), `thelounge-previews-${crypto.randomUUID()}`);
config.getPreviewCachePath = () => previewCachePath;
afterAll(() => fs.rmSync(previewCachePath, {recursive: true, force: true}));

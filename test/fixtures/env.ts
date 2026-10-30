import * as path from "path";
const home = path.join(process.cwd(), "test", "fixtures", ".thelounge");

import config from "../../server/config";
config.setHome(home);

// Test files run in parallel workers and wipe the preview cache, so each worker gets its own
const previewCachePath = path.join(home, "cache", `previews-${process.env.VITEST_POOL_ID ?? 0}`);
config.getPreviewCachePath = () => previewCachePath;

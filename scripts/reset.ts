import "./loadEnv";
import { getStore } from "../src/lib/store";
import { DEFAULT_PROFILE_ID } from "../src/lib/constants";

// Usage: npm run reset [-- --profile <profileId>]
const profileFlag = process.argv.indexOf("--profile");
const profileId = profileFlag !== -1 ? process.argv[profileFlag + 1] : DEFAULT_PROFILE_ID;
if (!profileId) {
  console.error("Missing value for --profile.");
  process.exit(1);
}

await getStore().reset(profileId);
console.log(`Reset ratings, exposures, recommendations, and hidden recommendations for profile "${profileId}".`);

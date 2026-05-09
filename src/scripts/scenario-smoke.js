import dotenv from "dotenv";
import { validateEnv } from "../config/env.js";
import { findUserByEmail } from "../services/auth-service.js";
import { generateScenarioForUser } from "../services/scenario-service.js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function main() {
  validateEnv();

  const email = process.argv[2];
  if (!email) {
    throw new Error("Usage: npm run scenario:smoke -- <user-email>");
  }

  const user = await findUserByEmail(email);
  if (!user) {
    throw new Error(`User not found for e-mail: ${email}`);
  }

  const result = await generateScenarioForUser(user);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

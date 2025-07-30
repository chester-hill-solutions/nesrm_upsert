//code runner
import { handler } from "./index.mjs";
import { readFile } from "fs/promises";

const main = async () => {
  const payload = JSON.parse(
    await readFile(new URL("./payload_example.json", import.meta.url))
  );
  const res = await handler(payload);
  console.log(res);
};

main();

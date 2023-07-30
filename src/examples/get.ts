import { connect } from "../index";

async function run() {
  const wb = await connect("ws://localhost:8080/ws");

  wb.set("hello", "world");

  const value = await wb.getValue("hello");
  console.log(value);

  wb.close();
}

run();
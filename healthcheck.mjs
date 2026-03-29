import http from "node:http";

const options = {
  hostname: "127.0.0.1",
  port: 3000,
  path: "/health",
  method: "GET",
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on("error", () => {
  process.exit(1);
});

req.end();

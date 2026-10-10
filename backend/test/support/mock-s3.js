/* ==========================================================================
   A stand-in for an S3-compatible object store (Cloudflare R2, Backblaze B2 …)
   for the tests: one bucket kept in memory, path-style addresses.

     PUT / GET / HEAD / DELETE  /<bucket>/<key>
     GET /<bucket>?list-type=2&prefix=…[&max-keys=][&continuation-token=]

   It does NOT check the signature's arithmetic (that is the signing library's
   job, and only a real store can prove it). It does refuse a request that is
   not signed at all, signed with another access key, or for another bucket,
   so the tests would notice an unsigned or misdirected request.

     const s3 = await createMockS3().listen();  s3.url, s3.bucket, s3.keyId, s3.secret
     s3.objects   Map of key -> Buffer        s3.requests   ["PUT private/ab/…", …]
     s3.down = true   every request is answered 503 (an outage)
   ========================================================================== */
import http from "node:http";

export function createMockS3({ bucket = "framex-test", keyId = "TESTKEYID0000000001", secret = "test-secret-not-a-real-one" } = {}) {
  const objects = new Map(); // key -> { body, at }
  const state = { url: "", bucket, keyId, secret, objects, requests: [], down: false, unsigned: 0 };
  const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const server = http.createServer((req, res) => {
    const parts = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => {
      const url = new URL(req.url, "http://mock");
      const [, inBucket, ...rest] = url.pathname.split("/");
      const key = decodeURIComponent(rest.join("/"));
      const send = (status, body = "", headers = {}) => {
        res.writeHead(status, { "Content-Type": "application/xml", ...headers });
        res.end(req.method === "HEAD" ? undefined : body);
      };
      if (state.down) return send(503, "<Error><Code>ServiceUnavailable</Code></Error>");
      const auth = req.headers.authorization || "";
      if (!auth.startsWith(`AWS4-HMAC-SHA256 Credential=${keyId}/`) || !/SignedHeaders=[^,]*host/.test(auth) || !/Signature=[0-9a-f]{64}/.test(auth) || !req.headers["x-amz-date"]) {
        state.unsigned += 1;
        return send(403, "<Error><Code>AccessDenied</Code></Error>");
      }
      if (decodeURIComponent(inBucket) !== bucket) return send(404, "<Error><Code>NoSuchBucket</Code></Error>");
      state.requests.push(`${req.method} ${key || "(list)"}`);

      if (!key && req.method === "GET") {
        const prefix = url.searchParams.get("prefix") || "";
        const max = Math.max(1, Number(url.searchParams.get("max-keys")) || 1000);
        const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
        const from = url.searchParams.get("continuation-token") ? all.indexOf(url.searchParams.get("continuation-token")) : 0;
        const page = all.slice(from, from + max);
        const more = from + max < all.length;
        return send(
          200,
          `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${xml(bucket)}</Name><Prefix>${xml(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${xml(all[from + max])}</NextContinuationToken>` : ""}${page
            .map((k) => `<Contents><Key>${xml(k)}</Key><LastModified>${new Date(objects.get(k).at).toISOString()}</LastModified><Size>${objects.get(k).body.length}</Size></Contents>`)
            .join("")}</ListBucketResult>`
        );
      }
      if (req.method === "PUT") {
        objects.set(key, { body: Buffer.concat(parts), at: Date.now() });
        return send(200, "", { ETag: '"mock"' });
      }
      const found = objects.get(key);
      if (req.method === "DELETE") {
        objects.delete(key);
        return send(204);
      }
      if (!found) return send(404, "<Error><Code>NoSuchKey</Code></Error>");
      if (req.method === "HEAD") return send(200, "", { "Content-Length": found.body.length, "Content-Type": "application/octet-stream" });
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": found.body.length });
        return res.end(found.body);
      }
      send(405);
    });
  });

  return {
    listen: () =>
      new Promise((resolve) =>
        server.listen(0, "127.0.0.1", () => {
          state.url = `http://127.0.0.1:${server.address().port}`;
          state.close = () => new Promise((r) => server.close(r));
          resolve(state);
        })
      )
  };
}

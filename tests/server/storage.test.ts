/** Client R2 : URL de téléversement signées sans somme de contrôle imposée (celle d'un corps vide serait déclarée). */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { describe, expect, it } from "vitest";
import { s3ClientOptions } from "../../server/services/storage.js";

describe("stockage R2", () => {
  it("signe une URL de téléversement que le navigateur peut utiliser telle quelle", async () => {
    const client = new S3Client(s3ClientOptions({ S3_REGION: "auto", S3_ENDPOINT: "https://compte.r2.cloudflarestorage.com", S3_ACCESS_KEY_ID: "cle", S3_SECRET_ACCESS_KEY: "secret" }));
    const url = new URL(await getSignedUrl(client, new PutObjectCommand({ Bucket: "talab-documents", Key: "affaires/a/b/plan.pdf", ContentType: "application/pdf" }), { expiresIn: 900 }));
    expect(url.origin).toBe("https://compte.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/talab-documents/affaires/a/b/plan.pdf");
    expect([...url.searchParams.keys()].filter((k) => k.toLowerCase().includes("checksum"))).toEqual([]);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  });
});

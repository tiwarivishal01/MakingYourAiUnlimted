import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors.js";

export class ApiKeyAuthenticator {
  private readonly hashes: Buffer[];

  public constructor(keys: readonly string[]) {
    this.hashes = keys.map((key) => this.hash(key));
  }

  public authenticate(authorization: string | undefined): void {
    if (this.hashes.length === 0) {
      return;
    }
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    if (token === undefined) {
      throw new AppError("UNAUTHORIZED", "A bearer API key is required.", 401);
    }
    const candidate = this.hash(token);
    if (!this.hashes.some((hash) => hash.length === candidate.length && timingSafeEqual(hash, candidate))) {
      throw new AppError("UNAUTHORIZED", "The API key is invalid.", 401);
    }
  }

  private hash(value: string): Buffer {
    return createHash("sha256").update(value).digest();
  }
}
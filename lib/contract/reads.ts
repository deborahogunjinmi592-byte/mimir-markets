/**
 * Read-only contract helpers.
 *
 * Houses the raw contract read paths (single claim, range queries, and
 * per-creator paginated index reads) that wrap the generated bindings
 * client. No state-changing logic lives here.
 */

import { getContractClient } from './client';

export interface RawClaim {
  id: bigint;
  creator: string;
  amount: bigint;
  status: number;
  createdAt: bigint;
  expiresAt: bigint;
  metadataUri?: string;
}

export interface RawClaimRange {
  claims: RawClaim[];
  nextCursor?: bigint;
  total: number;
}

export interface CreatorClaimsPage {
  ids: bigint[];
  total: number;
}

/**
 * Fetch a single claim by id directly from the contract.
 * Returns null when the claim does not exist.
 */
export async function readClaimRaw(id: bigint | number | string): Promise<RawClaim | null> {
  const client = getContractClient();
  const claimId = typeof id === 'bigint' ? id : BigInt(id);
  try {
    const result = await client.readClaim({ id: claimId });
    if (!result) {
      return null;
    }
    return normalizeRawClaim(result);
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}

/**
 * Fetch a page of claims within a cursor range.
 */
export async function readClaimsRange(
  startCursor: bigint | number | string = 0,
  limit: number = 20,
): Promise<RawClaimRange> {
  const client = getContractClient();
  const cursor = typeof startCursor === 'bigint' ? startCursor : BigInt(startCursor);
  const result = await client.readClaimsRange({ startCursor: cursor, limit: BigInt(limit) });
  const claims = (result.claims ?? []).map(normalizeRawClaim);
  return {
    claims,
    nextCursor: result.nextCursor ?? undefined,
    total: claims.length,
  };
}

/**
 * Fetch a page of claim ids created by a specific creator.
 *
 * Uses the contract's per-creator index (`get_creator_claims`), avoiding
 * the O(total claims) scan that client-side filtering requires.
 */
export async function readCreatorClaims(
  creator: string,
  offset: number = 0,
  limit: number = 20,
): Promise<CreatorClaimsPage> {
  const client = getContractClient();
  const result = await client.getCreatorClaims({
    creator,
    offset: BigInt(offset),
    limit: BigInt(limit),
  });
  const ids = (result.ids ?? result[0] ?? []).map(toBigInt);
  const totalRaw = result.total ?? result[1] ?? ids.length;
  return {
    ids,
    total: Number(totalRaw),
  };
}

function normalizeRawClaim(input: any): RawClaim {
  return {
    id: toBigInt(input.id),
    creator: String(input.creator),
    amount: toBigInt(input.amount),
    status: Number(input.status),
    createdAt: toBigInt(input.createdAt),
    expiresAt: toBigInt(input.expiresAt),
    metadataUri: input.metadataUri ?? input.metadataURI ?? undefined,
  };
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const message = String((err as { message?: unknown }).message ?? '').toLowerCase();
  return message.includes('not found') || message.includes('notfound');
}

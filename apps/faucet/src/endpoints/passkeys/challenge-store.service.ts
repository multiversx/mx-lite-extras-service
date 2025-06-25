import { Injectable } from '@nestjs/common';
import { CacheService } from '@multiversx/sdk-nestjs-cache';

interface StoredChallenge {
    challenge: string;
    expiresAt: Date;
}

/**
 * Service to manage temporary storage of authentication challenges.
 * Uses Redis for distributed caching to ensure scalability and reliability.
 */
@Injectable()
export class ChallengeStoreService {
    // Challenge expiration time in milliseconds (5 minutes)
    private readonly CHALLENGE_EXPIRATION_MS = 5 * 60 * 1000;
    // Redis key prefix for challenge keys
    private readonly KEY_PREFIX = 'passkey:challenge:';

    constructor(
        private readonly cacheService: CacheService,
    ) { }

    /**
     * Stores a challenge for a given passkey ID in Redis
     * @param passKeyId The passkey ID
     * @param challenge The challenge to store
     */
    async storeChallenge(passKeyId: string, challenge: string): Promise<void> {
        const expiresAt = new Date(Date.now() + this.CHALLENGE_EXPIRATION_MS);
        const value = JSON.stringify({ challenge, expiresAt });

        // Store in Redis with expiration
        await this.cacheService.setRemote(
            this.getChallengeKey(passKeyId),
            value,
            this.CHALLENGE_EXPIRATION_MS / 1000 // Convert to seconds for Redis
        );
    }

    /**
     * Retrieves a challenge for a given passkey ID from Redis
     * @param passKeyId The passkey ID
     * @returns The stored challenge or null if not found or expired
     */
    async getChallenge(passKeyId: string): Promise<string | null> {
        const storedValue = await this.cacheService.getRemote<string>(this.getChallengeKey(passKeyId));

        if (!storedValue) {
            return null;
        }

        const stored: StoredChallenge = JSON.parse(storedValue);

        // Check if challenge has expired (should not happen as Redis handles expiration)
        if (new Date(stored.expiresAt) < new Date()) {
            await this.removeChallenge(passKeyId);
            return null;
        }

        return stored.challenge;
    }

    /**
     * Verifies if a provided challenge matches the stored challenge for a passkey ID
     * @param passKeyId The passkey ID
     * @param challenge The challenge to verify
     * @returns True if the challenge is valid, false otherwise
     */
    async verifyChallenge(passKeyId: string, challenge: string): Promise<boolean> {
        const storedChallenge = await this.getChallenge(passKeyId);

        if (!storedChallenge) {
            return false;
        }

        // Verify that the provided challenge matches the stored one
        const isValid = storedChallenge === challenge;

        // If valid, remove the challenge (one-time use)
        if (isValid) {
            await this.removeChallenge(passKeyId);
        }

        return isValid;
    }

    /**
     * Removes a stored challenge from Redis
     * @param passKeyId The passkey ID
     */
    private async removeChallenge(passKeyId: string): Promise<void> {
        await this.cacheService.delete(this.getChallengeKey(passKeyId));
    }

    /**
     * Creates a Redis key for a challenge
     * @param passKeyId The passkey ID
     * @returns The Redis key
     */
    private getChallengeKey(passKeyId: string): string {
        return `${this.KEY_PREFIX}${passKeyId}`;
    }
} 
import { Test, TestingModule } from '@nestjs/testing';
import { ChallengeStoreService } from './challenge-store.service';
import { CacheService } from '@multiversx/sdk-nestjs-cache';

describe('ChallengeStoreService', () => {
    let service: ChallengeStoreService;
    let cacheService: CacheService;

    const mockCacheService = {
        setRemote: jest.fn().mockResolvedValue(undefined),
        getRemote: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ChallengeStoreService,
                { provide: CacheService, useValue: mockCacheService },
            ],
        }).compile();

        service = module.get<ChallengeStoreService>(ChallengeStoreService);
        cacheService = module.get<CacheService>(CacheService);

        // Reset all mocks before each test
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('storeChallenge', () => {
        it('should store a challenge in Redis', async () => {
            // Arrange
            const passKeyId = 'test-passkey';
            const challenge = 'test-challenge';

            // Act
            await service.storeChallenge(passKeyId, challenge);

            // Assert
            expect(cacheService.setRemote).toHaveBeenCalledWith(
                'passkey:challenge:test-passkey',
                expect.any(String),
                expect.any(Number)
            );

            // Verify that the stored value contains the correct challenge
            const storedValue = JSON.parse(mockCacheService.setRemote.mock.calls[0][1]);
            expect(storedValue).toHaveProperty('challenge', challenge);
            expect(storedValue).toHaveProperty('expiresAt');
        });
    });

    describe('getChallenge', () => {
        it('should return null if no challenge is found', async () => {
            // Arrange
            const passKeyId = 'non-existent-passkey';
            mockCacheService.getRemote.mockResolvedValue(null);

            // Act
            const result = await service.getChallenge(passKeyId);

            // Assert
            expect(result).toBeNull();
            expect(cacheService.getRemote).toHaveBeenCalledWith('passkey:challenge:non-existent-passkey');
        });

        it('should return the challenge if it exists and is not expired', async () => {
            // Arrange
            const passKeyId = 'test-passkey';
            const challenge = 'test-challenge';
            const expiresAt = new Date(Date.now() + 1000 * 60 * 5); // 5 minutes from now

            mockCacheService.getRemote.mockResolvedValue(JSON.stringify({
                challenge,
                expiresAt,
            }));

            // Act
            const result = await service.getChallenge(passKeyId);

            // Assert
            expect(result).toBe(challenge);
            expect(cacheService.getRemote).toHaveBeenCalledWith('passkey:challenge:test-passkey');
        });

        it('should remove and return null if the challenge has expired', async () => {
            // Arrange
            const passKeyId = 'test-passkey';
            const challenge = 'test-challenge';
            const expiresAt = new Date(Date.now() - 1000); // 1 second ago (expired)

            mockCacheService.getRemote.mockResolvedValue(JSON.stringify({
                challenge,
                expiresAt,
            }));

            // Act
            const result = await service.getChallenge(passKeyId);

            // Assert
            expect(result).toBeNull();
            expect(cacheService.getRemote).toHaveBeenCalledWith('passkey:challenge:test-passkey');
            expect(cacheService.delete).toHaveBeenCalledWith('passkey:challenge:test-passkey');
        });
    });

    describe('verifyChallenge', () => {
        it('should return false if no challenge is found', async () => {
            // Arrange
            const passKeyId = 'non-existent-passkey';
            const challenge = 'test-challenge';

            // Mock getChallenge to return null
            mockCacheService.getRemote.mockResolvedValue(null);

            // Act
            const result = await service.verifyChallenge(passKeyId, challenge);

            // Assert
            expect(result).toBe(false);
            expect(cacheService.getRemote).toHaveBeenCalledWith('passkey:challenge:non-existent-passkey');
            expect(cacheService.delete).not.toHaveBeenCalled();
        });

        it('should return false if challenge does not match', async () => {
            // Arrange
            const passKeyId = 'test-passkey';
            const storedChallenge = 'stored-challenge';
            const providedChallenge = 'different-challenge';
            const expiresAt = new Date(Date.now() + 1000 * 60 * 5); // 5 minutes from now

            mockCacheService.getRemote.mockResolvedValue(JSON.stringify({
                challenge: storedChallenge,
                expiresAt,
            }));

            // Act
            const result = await service.verifyChallenge(passKeyId, providedChallenge);

            // Assert
            expect(result).toBe(false);
            expect(cacheService.getRemote).toHaveBeenCalledWith('passkey:challenge:test-passkey');
            expect(cacheService.delete).not.toHaveBeenCalled();
        });

        it('should return true and remove the challenge if it matches', async () => {
            // Arrange
            const passKeyId = 'test-passkey';
            const challenge = 'test-challenge';
            const expiresAt = new Date(Date.now() + 1000 * 60 * 5); // 5 minutes from now

            mockCacheService.getRemote.mockResolvedValue(JSON.stringify({
                challenge,
                expiresAt,
            }));

            // Act
            const result = await service.verifyChallenge(passKeyId, challenge);

            // Assert
            expect(result).toBe(true);
            expect(cacheService.getRemote).toHaveBeenCalledWith('passkey:challenge:test-passkey');
            expect(cacheService.delete).toHaveBeenCalledWith('passkey:challenge:test-passkey');
        });
    });
}); 
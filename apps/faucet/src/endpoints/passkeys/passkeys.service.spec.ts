import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PasskeysService } from './passkeys.service';
import { MongoDbPersistenceService } from '../../helpers/persistence/mongodb/mongodb.persistence.service';
import { ChallengeStoreService } from './challenge-store.service';
import { PasskeyAddressDb } from '../../helpers/persistence/mongodb/entities/passkey-address.db';
import { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { ApiConfigService } from '../../helpers/api.config.service';
import { VerifiedAuthenticationResponse } from '@simplewebauthn/server';

// Mock authentication response for tests
const mockAuthResponse: AuthenticationResponseJSON = {
    id: 'test-passkey-id',
    rawId: 'test-raw-id',
    response: {
        clientDataJSON: 'test-client-data',
        authenticatorData: 'test-auth-data',
        signature: 'test-signature',
        userHandle: 'test-user-handle',
    },
    type: 'public-key',
    clientExtensionResults: {},
};

describe('PasskeysService', () => {
    let service: PasskeysService;
    let persistenceService: MongoDbPersistenceService;
    let challengeStore: ChallengeStoreService;

    // Mock the database service
    const mockPersistenceService = {
        getPasskeyAddressByPasskeyId: jest.fn(),
        createPasskeyAddress: jest.fn(),
    };

    // Mock the challenge store service
    const mockChallengeStore = {
        storeChallenge: jest.fn().mockResolvedValue(undefined),
        verifyChallenge: jest.fn().mockResolvedValue(true),
    };

    // Mock config service
    const mockConfigService = {
        getPasskeysConfig: jest.fn(() => {
            return {
                pId: 'test.example.com',
                rpName: 'https://test.example.com',
            };
        }),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PasskeysService,
                { provide: MongoDbPersistenceService, useValue: mockPersistenceService },
                { provide: ChallengeStoreService, useValue: mockChallengeStore },
                { provide: ApiConfigService, useValue: mockConfigService },
            ],
        }).compile();

        service = module.get<PasskeysService>(PasskeysService);
        persistenceService = module.get<MongoDbPersistenceService>(MongoDbPersistenceService);
        challengeStore = module.get<ChallengeStoreService>(ChallengeStoreService);

        // Reset all mocks before each test
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('registerPasskeyAddress', () => {
        it('should return existing association if passkey ID already exists', async () => {
            // Arrange
            const passKeyId = 'existing-passkey';
            const publicAddress = 'test-address';
            const existingAssociation = new PasskeyAddressDb();
            existingAssociation.passKeyId = passKeyId;
            existingAssociation.publicAddress = 'existing-address';

            mockPersistenceService.getPasskeyAddressByPasskeyId.mockResolvedValue(existingAssociation);

            // Act
            const result = await service.registerPasskeyAddress(passKeyId, publicAddress);

            // Assert
            expect(result).toBe(existingAssociation);
            expect(mockPersistenceService.getPasskeyAddressByPasskeyId).toHaveBeenCalledWith(passKeyId);
            expect(mockPersistenceService.createPasskeyAddress).not.toHaveBeenCalled();
        });

        it('should create a new association if passkey ID does not exist', async () => {
            // Arrange
            const passKeyId = 'new-passkey';
            const publicAddress = 'test-address';
            const newAssociation = new PasskeyAddressDb();
            newAssociation.passKeyId = passKeyId;
            newAssociation.publicAddress = publicAddress;

            mockPersistenceService.getPasskeyAddressByPasskeyId.mockResolvedValue(null);
            mockPersistenceService.createPasskeyAddress.mockResolvedValue(newAssociation);

            // Act
            const result = await service.registerPasskeyAddress(passKeyId, publicAddress);

            // Assert
            expect(result).toBe(newAssociation);
            expect(mockPersistenceService.getPasskeyAddressByPasskeyId).toHaveBeenCalledWith(passKeyId);
            expect(mockPersistenceService.createPasskeyAddress).toHaveBeenCalled();
        });
    });

    describe('generateChallenge', () => {
        it('should generate and store a challenge', async () => {
            // Arrange
            const passKeyId = 'test-passkey';

            // Act
            const result = await service.generateChallenge(passKeyId);

            // Assert
            expect(result).toHaveProperty('challenge');
            expect(typeof result.challenge).toBe('string');
            expect(result.challenge.length).toBeGreaterThan(0);
            expect(challengeStore.storeChallenge).toHaveBeenCalledWith(passKeyId, result.challenge);
        });
    });

    describe('verifyChallenge', () => {
        it('should throw BadRequestException if challenge verification fails', async () => {
            // Arrange
            const passKeyId = 'test-passkey';
            const challenge = 'test-challenge';
            const publicAddress = 'test-address';

            mockChallengeStore.verifyChallenge.mockResolvedValue(false);

            // Act & Assert
            await expect(
                service.verifyChallenge(passKeyId, challenge, mockAuthResponse, publicAddress),
            ).rejects.toThrow('Invalid or expired challenge');

            expect(challengeStore.verifyChallenge).toHaveBeenCalledWith(passKeyId, challenge);
        });

        it('should throw ConflictException if passkey is already associated with a different address', async () => {
            // Arrange
            const passKeyId = 'test-passkey';
            const challenge = 'test-challenge';
            const publicAddress = 'new-address';
            const existingAssociation = new PasskeyAddressDb();
            existingAssociation.passKeyId = passKeyId;
            existingAssociation.publicAddress = 'existing-address'; // Different from the provided address

            mockChallengeStore.verifyChallenge.mockResolvedValue(true);
            mockPersistenceService.getPasskeyAddressByPasskeyId.mockResolvedValue(existingAssociation);

            jest.spyOn(service, 'verifyAuthenticationResponse').mockImplementation(() => Promise.resolve({ verified: true } as VerifiedAuthenticationResponse));

            // Act & Assert
            await expect(
                service.verifyChallenge(passKeyId, challenge, mockAuthResponse, publicAddress),
            ).rejects.toThrow('This passkey is already associated with a different public address');

            expect(challengeStore.verifyChallenge).toHaveBeenCalledWith(passKeyId, challenge);
            expect(persistenceService.getPasskeyAddressByPasskeyId).toHaveBeenCalledWith(passKeyId);
        });

        it('should return existing association if passkey is already associated with the same address', async () => {
            // Arrange
            const passKeyId = 'test-passkey';
            const challenge = 'test-challenge';
            const publicAddress = 'test-address';
            const existingAssociation = new PasskeyAddressDb();
            existingAssociation.passKeyId = passKeyId;
            existingAssociation.publicAddress = publicAddress; // Same as the provided address

            mockChallengeStore.verifyChallenge.mockResolvedValue(true);
            mockPersistenceService.getPasskeyAddressByPasskeyId.mockResolvedValue(existingAssociation);

            jest.spyOn(service, 'verifyAuthenticationResponse').mockImplementation(() => Promise.resolve({ verified: true } as VerifiedAuthenticationResponse));

            // Act
            const result = await service.verifyChallenge(passKeyId, challenge, mockAuthResponse, publicAddress);

            // Assert
            expect(result).toBe(existingAssociation);
            expect(challengeStore.verifyChallenge).toHaveBeenCalledWith(passKeyId, challenge);
            expect(persistenceService.getPasskeyAddressByPasskeyId).toHaveBeenCalledWith(passKeyId);
        });
    });

    describe('getPasskeyAddressInfo', () => {
        it('should throw NotFoundException if no association is found', async () => {
            // Arrange
            const passKeyId = 'non-existent-passkey';
            mockPersistenceService.getPasskeyAddressByPasskeyId.mockResolvedValue(null);

            // Act & Assert
            await expect(service.getPasskeyAddressInfo(passKeyId)).rejects.toThrow(NotFoundException);
            expect(persistenceService.getPasskeyAddressByPasskeyId).toHaveBeenCalledWith(passKeyId);
        });

        it('should return the association if found', async () => {
            // Arrange
            const passKeyId = 'existing-passkey';
            const existingAssociation = new PasskeyAddressDb();
            existingAssociation.passKeyId = passKeyId;
            existingAssociation.publicAddress = 'test-address';

            mockPersistenceService.getPasskeyAddressByPasskeyId.mockResolvedValue(existingAssociation);

            // Act
            const result = await service.getPasskeyAddressInfo(passKeyId);

            // Assert
            expect(result).toBe(existingAssociation);
            expect(persistenceService.getPasskeyAddressByPasskeyId).toHaveBeenCalledWith(passKeyId);
        });
    });
}); 
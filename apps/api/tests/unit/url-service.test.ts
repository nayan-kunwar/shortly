import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError } from '../../src/errors/conflict-error.js';

let randomCodeCalls = 0;

vi.mock('../../src/utils/base62.js', () => ({
  encodeBase62: vi.fn(),
  decodeBase62: vi.fn(),
  generateRandomCode: vi.fn(() => {
    randomCodeCalls++;
    return randomCodeCalls === 1 ? 'collision' : 'unique7x';
  }),
}));

import { UrlService } from '../../src/services/url.service.js';
import { generateRandomCode } from '../../src/utils/base62.js';

const NOW = new Date('2025-01-15T10:00:00Z');

function mockRepo(overrides: { create?: ReturnType<typeof vi.fn> } = {}) {
  return {
    create: overrides.create ?? vi.fn(),
    findByShortCode: vi.fn(),
    deactivate: vi.fn(),
    update: vi.fn(),
    createWithGeneratedCode: vi.fn(),
    countUrls: vi.fn(),
    listUrls: vi.fn(),
    findByCustomAlias: vi.fn(),
  };
}

function mockCache() {
  return {
    lookup: vi.fn(),
    store: vi.fn(),
    invalidate: vi.fn().mockResolvedValue(undefined),
  };
}

function mockEmitter() {
  return { emit: vi.fn() };
}

function mockAnalytics() {
  return {
    countByShortCode: vi.fn().mockResolvedValue(0),
    countAll: vi.fn().mockResolvedValue(0),
    getStats: vi.fn(),
  };
}

function createdRow(shortCode: string) {
  return {
    id: 1,
    shortCode,
    originalUrl: 'https://example.com',
    customAlias: null,
    userId: null,
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: null,
    isActive: true,
  };
}

describe('UrlService.createShortUrl — collision retry', () => {
  beforeEach(() => {
    randomCodeCalls = 0;
  });

  it('retries on short_code ConflictError and returns the second code', async () => {
    const createMock = vi
      .fn()
      .mockRejectedValueOnce(new ConflictError('shortCode'))
      .mockResolvedValueOnce(createdRow('unique7x'));

    const service = new UrlService(
      mockRepo({ create: createMock }),
      mockCache(),
      mockEmitter(),
      mockAnalytics(),
    );

    const result = await service.createShortUrl({ url: 'https://example.com' });

    expect(result.shortCode).toBe('unique7x');
    expect(result.shortUrl).toBe('http://localhost:3000/unique7x');
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock).toHaveBeenNthCalledWith(1, {
      shortCode: 'collision',
      originalUrl: 'https://example.com',
      customAlias: null,
      expiresAt: null,
    });
    expect(createMock).toHaveBeenNthCalledWith(2, {
      shortCode: 'unique7x',
      originalUrl: 'https://example.com',
      customAlias: null,
      expiresAt: null,
    });
    expect(generateRandomCode).toHaveBeenCalledWith(7);
  });

  it('throws after MAX_RETRIES (5) consecutive collisions', async () => {
    const createMock = vi.fn().mockRejectedValue(new ConflictError('shortCode'));

    const service = new UrlService(
      mockRepo({ create: createMock }),
      mockCache(),
      mockEmitter(),
      mockAnalytics(),
    );

    await expect(service.createShortUrl({ url: 'https://example.com' })).rejects.toThrow(
      'Failed to generate a unique short code after 5 attempts',
    );
    expect(createMock).toHaveBeenCalledTimes(5);
  });

  it('propagates non-shortCode ConflictError immediately (no retry)', async () => {
    const createMock = vi.fn().mockRejectedValue(new ConflictError('customAlias'));

    const service = new UrlService(
      mockRepo({ create: createMock }),
      mockCache(),
      mockEmitter(),
      mockAnalytics(),
    );

    await expect(
      service.createShortUrl({ url: 'https://example.com', customAlias: 'taken' }),
    ).rejects.toThrow(ConflictError);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('propagates non-ConflictError immediately (no retry)', async () => {
    const createMock = vi.fn().mockRejectedValue(new Error('DB connection lost'));

    const service = new UrlService(
      mockRepo({ create: createMock }),
      mockCache(),
      mockEmitter(),
      mockAnalytics(),
    );

    await expect(service.createShortUrl({ url: 'https://example.com' })).rejects.toThrow(
      'DB connection lost',
    );
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache after successful creation', async () => {
    const createMock = vi.fn().mockResolvedValue(createdRow('unique7x'));
    const cache = mockCache();

    const service = new UrlService(mockRepo({ create: createMock }), cache, mockEmitter(), mockAnalytics());

    await service.createShortUrl({ url: 'https://example.com' });

    expect(cache.invalidate).toHaveBeenCalledWith('unique7x');
  });
});

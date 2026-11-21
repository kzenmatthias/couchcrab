import { describe, expect, it } from 'vitest';
import {
	clockDuration,
	initials,
	isRealYoutubeId,
	spokenDuration,
	textOn,
	youtubeThumbnailUrl
} from '#lib/video.js';

describe('video helpers', () => {
	it('tells real YouTube ids from demo ids', () => {
		expect(isRealYoutubeId('dQw4w9WgXcQ')).toBe(true);
		expect(isRealYoutubeId('demo000000a')).toBe(false);
		expect(isRealYoutubeId('short')).toBe(false);
		expect(youtubeThumbnailUrl('dQw4w9WgXcQ')).toBe(
			'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg'
		);
	});

	it('formats durations for the eye and the ear', () => {
		expect(clockDuration(1880)).toBe('31:20');
		expect(clockDuration(4320)).toBe('1:12:00');
		expect(spokenDuration(1880, 'en')).toBe('31 minutes');
		expect(spokenDuration(4320, 'en')).toBe('1 hour, 12 minutes');
		expect(spokenDuration(3600, 'nl')).toBe('1 uur');
	});

	it('makes avatar initials and picks a readable text colour', () => {
		expect(initials('Tidecaller Juno')).toBe('TJ');
		expect(initials('Quillby')).toBe('QU');
		expect(textOn('#ffd166')).toBe('#000000');
		expect(textOn('#1a1230')).toBe('#ffffff');
	});
});

/**
 * Demo data for development and tests.
 *
 * Everything here is FICTIONAL: the creators, channels, series and videos are made up,
 * and the YouTube ids are fake. Real data comes from the community through the app.
 */
import { eq } from 'drizzle-orm';
import type { DB } from './client';
import * as t from './schema';

const DAY = 24 * 60 * 60 * 1000;
/** Monday 7 September 2026, 16:00 UTC: start of the demo season. */
const SEASON_START = Date.UTC(2026, 8, 7, 16);

const at = (base: number, days: number, hours = 0) =>
	new Date(base + days * DAY + hours * 3600_000);

/** Deterministic fake 11-character YouTube video id. */
const fakeVideoId = (n: number) => `demo${n.toString(36).padStart(7, '0')}`;
/** Deterministic fake 24-character YouTube channel id. */
const fakeChannelId = (slug: string) =>
	`UCdemo${slug.replace(/[^a-z0-9]/g, '').padEnd(18, 'x')}`.slice(0, 24);

const CREATORS = [
	{
		slug: 'pebblewick',
		name: 'Pebblewick',
		color: '#e05d5d',
		bio: 'Builds tiny villages and huge pranks.'
	},
	{
		slug: 'marrowfen',
		name: 'Marrowfen',
		color: '#ffd166',
		bio: 'Redstone tinkerer, mostly on purpose.'
	},
	{
		slug: 'tidecaller-juno',
		name: 'Tidecaller Juno',
		color: '#7bd389',
		bio: 'Ocean monuments and long chats.'
	},
	{
		slug: 'brassmoth',
		name: 'Brassmoth',
		color: '#9ad0ff',
		bio: 'Game maker. Every base is a minigame.'
	},
	{ slug: 'quillby', name: 'Quillby', color: '#f78fb3', bio: 'Terraforming, one block at a time.' },
	{
		slug: 'saffron-vale',
		name: 'Saffron Vale',
		color: '#ff9f43',
		bio: 'Shopkeeper and part-time villain.'
	},
	{ slug: 'oakhollow', name: 'Oakhollow', color: '#c792ea', bio: 'Story-driven survival.' },
	{
		slug: 'nimbleknot',
		name: 'Nimbleknot',
		color: '#a0e7e5',
		bio: 'Speedruns everything, even farming.'
	},
	{
		slug: 'ferrocrest',
		name: 'Ferrocrest',
		color: '#b4f8c8',
		bio: 'Castles, walls and more walls.'
	},
	{
		slug: 'lumen-pike',
		name: 'Lumen Pike',
		color: '#fbe7c6',
		bio: 'Lighting nerd and night builder.'
	},
	{
		slug: 'driftwood-dot',
		name: 'Driftwood Dot',
		color: '#ffaebc',
		bio: 'Cosy builds and chaotic streams.'
	},
	{
		slug: 'cobalt-wren',
		name: 'Cobalt Wren',
		color: '#cdb4db',
		bio: 'Engineer of questionable machines.'
	}
] as const;

type Slug = (typeof CREATORS)[number]['slug'];

const TITLE_WORDS = [
	'The Big Reveal',
	'Mountain Village',
	'Redstone Gone Wrong',
	'A Very Long Bridge',
	'Shop Wars Begin',
	'The Secret Tunnel',
	'Moving House Again',
	'Farm of the Century',
	'Prank Night',
	'Into the Deep Dark',
	'Lighthouse Finished',
	'The Grand Opening'
];

export type SeedSummary = {
	creators: number;
	series: number;
	videos: number;
	pages: number;
};

/** Removes all rows from every table, children first. */
export function clearDatabase(db: DB) {
	db.transaction((tx) => {
		for (const table of [
			t.progress,
			t.userSettings,
			t.userSeriesCreators,
			t.userCreators,
			t.auditLog,
			t.suggestions,
			t.claims,
			t.sessions,
			t.users,
			t.pageTranslations,
			t.pages,
			t.titleRules,
			t.videos,
			t.groups,
			t.seriesCreators,
			t.seriesTranslations,
			t.channels,
			t.creators
		]) {
			tx.delete(table).run();
		}
		// Extras point at their parent series, so delete those first.
		tx.delete(t.series).run();
	});
}

export function seed(db: DB): SeedSummary {
	let videoCount = 0;
	let videoN = 0;

	db.transaction((tx) => {
		const fetchedAt = new Date(SEASON_START + 40 * DAY);

		/* creators and channels */
		const creatorId = new Map<Slug, number>();
		const mainChannel = new Map<Slug, number>();
		const secondChannel = new Map<Slug, number>();
		for (const c of CREATORS) {
			const row = tx.insert(t.creators).values(c).returning({ id: t.creators.id }).get();
			creatorId.set(c.slug, row.id);
			const ch = tx
				.insert(t.channels)
				.values({
					creatorId: row.id,
					youtubeChannelId: fakeChannelId(c.slug),
					title: c.name,
					kind: 'main'
				})
				.returning({ id: t.channels.id })
				.get();
			mainChannel.set(c.slug, ch.id);
		}
		for (const slug of ['pebblewick', 'brassmoth', 'driftwood-dot'] as const) {
			const ch = tx
				.insert(t.channels)
				.values({
					creatorId: creatorId.get(slug)!,
					youtubeChannelId: fakeChannelId(`${slug}2`),
					title: `${CREATORS.find((c) => c.slug === slug)!.name} Plays`,
					kind: 'secondary'
				})
				.returning({ id: t.channels.id })
				.get();
			secondChannel.set(slug, ch.id);
		}

		const addVideo = (v: {
			channel: number;
			title: string;
			publishedAt: Date;
			durationS: number;
			seriesId: number | null;
			groupId?: number | null;
			episode?: number | null;
			captions?: boolean;
			liveVod?: boolean;
		}) => {
			videoN += 1;
			videoCount += 1;
			tx.insert(t.videos)
				.values({
					youtubeVideoId: fakeVideoId(videoN),
					channelId: v.channel,
					title: v.title,
					publishedAt: v.publishedAt,
					durationS: v.durationS,
					hasCreatorCaptions: v.captions ?? false,
					isLiveVod: v.liveVod ?? false,
					seriesId: v.seriesId,
					groupId: v.groupId ?? null,
					episodeNumber: v.episode ?? null,
					status: v.seriesId ? 'placed' : 'unsorted',
					placedBy: v.seriesId ? 'rule' : null,
					fetchedAt
				})
				.run();
		};

		const addSeries = (
			s: typeof t.series.$inferInsert,
			members: readonly Slug[],
			descriptions: { en: string; nl: string }
		) => {
			const row = tx.insert(t.series).values(s).returning({ id: t.series.id }).get();
			tx.insert(t.seriesCreators)
				.values(members.map((slug) => ({ seriesId: row.id, creatorId: creatorId.get(slug)! })))
				.run();
			tx.insert(t.seriesTranslations)
				.values([
					{ seriesId: row.id, locale: 'en', description: descriptions.en },
					{ seriesId: row.id, locale: 'nl', description: descriptions.nl }
				])
				.run();
			return row.id;
		};

		/* 1. A season, grouped by week */
		const seasonMembers = [
			'pebblewick',
			'marrowfen',
			'tidecaller-juno',
			'brassmoth',
			'quillby',
			'saffron-vale',
			'oakhollow',
			'ferrocrest'
		] as const;
		const season = addSeries(
			{
				slug: 'lanternfall-season-3',
				title: 'Lanternfall Season 3',
				kind: 'season',
				status: 'ongoing',
				grouping: 'week',
				startedAt: new Date(SEASON_START),
				poster: { type: 'art', palette: 'meadow', seed: 11 }
			},
			seasonMembers,
			{
				en: 'Eight builders, one new world and a lot of lanterns. The third season of a friendly survival server.',
				nl: 'Acht bouwers, een nieuwe wereld en heel veel lantaarns. Het derde seizoen van een gezellige survivalserver.'
			}
		);
		tx.insert(t.titleRules)
			.values([
				{
					seriesId: season,
					pattern: 'Lanternfall',
					match: 'contains',
					target: 'main',
					priority: 10
				},
				{ seriesId: season, pattern: '^LF3\\b', match: 'regex', target: 'main', priority: 20 }
			])
			.run();
		// Three weeks, each member uploads once or twice a week.
		const episode = new Map<Slug, number>();
		for (let week = 0; week < 3; week++) {
			seasonMembers.forEach((slug, i) => {
				if ((week + i) % 3 === 2 && i > 3) return; // not everyone uploads every week
				const ep = (episode.get(slug) ?? 0) + 1;
				episode.set(slug, ep);
				addVideo({
					channel: mainChannel.get(slug)!,
					title: `Lanternfall 3: ${TITLE_WORDS[(week * 3 + i) % TITLE_WORDS.length]} (Ep ${ep})`,
					publishedAt: at(SEASON_START, week * 7 + (i % 5), i),
					durationS: 1500 + ((week * 7 + i * 13) % 20) * 60,
					seriesId: season,
					episode: ep,
					captions: i % 3 === 0
				});
			});
		}
		// One upload on a second channel still belongs to the main series.
		addVideo({
			channel: secondChannel.get('pebblewick')!,
			title: 'Lanternfall 3 side build: the lantern factory',
			publishedAt: at(SEASON_START, 17, 3),
			durationS: 1260,
			seriesId: season
		});

		/* 2. Extras for the season: livestream VODs */
		const extras = addSeries(
			{
				slug: 'lanternfall-season-3-extras',
				title: 'Lanternfall Season 3 Extras',
				kind: 'other',
				status: 'ongoing',
				grouping: 'none',
				parentId: season,
				startedAt: new Date(SEASON_START),
				poster: { type: 'art', palette: 'meadow', seed: 12 }
			},
			['brassmoth', 'driftwood-dot', 'pebblewick'],
			{
				en: 'Livestreams from the Lanternfall Season 3 creators.',
				nl: 'Livestreams van de makers van Lanternfall seizoen 3.'
			}
		);
		[
			['brassmoth', 'Lanternfall stream: building the arena live'],
			['pebblewick', 'Lanternfall stream: village planning'],
			['brassmoth', 'Lanternfall stream: Q&A and redstone'],
			['pebblewick', 'Lanternfall stream: the big move']
		].forEach(([slug, title], i) => {
			addVideo({
				channel: (secondChannel.get(slug as Slug) ?? mainChannel.get(slug as Slug))!,
				title,
				publishedAt: at(SEASON_START, 3 + i * 6, 20),
				durationS: 3 * 3600 + i * 600,
				seriesId: extras,
				liveVod: true
			});
		});

		/* 3. A live series, grouped by session */
		const liveMembers = [
			'nimbleknot',
			'lumen-pike',
			'driftwood-dot',
			'cobalt-wren',
			'quillby',
			'oakhollow'
		] as const;
		const liveStart = Date.UTC(2026, 9, 1, 18);
		const live = addSeries(
			{
				slug: 'ember-hearts',
				title: 'Ember Hearts',
				kind: 'live_series',
				status: 'ongoing',
				grouping: 'session',
				startedAt: new Date(liveStart),
				poster: { type: 'art', palette: 'ember', seed: 4 }
			},
			liveMembers,
			{
				en: 'Six players, three lives each. Every session is played live together and uploaded by each player.',
				nl: 'Zes spelers met elk drie levens. Elke sessie wordt samen live gespeeld en door elke speler apart geüpload.'
			}
		);
		tx.insert(t.titleRules)
			.values({
				seriesId: live,
				pattern: 'Ember Hearts',
				match: 'contains',
				target: 'main',
				priority: 10
			})
			.run();
		for (let s = 1; s <= 3; s++) {
			const day = (s - 1) * 7;
			const group = tx
				.insert(t.groups)
				.values({
					seriesId: live,
					kind: 'session',
					number: s,
					startsAt: at(liveStart, day),
					endsAt: at(liveStart, day, 3)
				})
				.returning({ id: t.groups.id })
				.get();
			liveMembers.forEach((slug, i) => {
				if ((s + i) % 4 === 0) return; // someone missed a session upload
				addVideo({
					channel: mainChannel.get(slug)!,
					title: `Ember Hearts #${s}: ${TITLE_WORDS[(s * 5 + i) % TITLE_WORDS.length]}`,
					publishedAt: at(liveStart, day + 1, i),
					durationS: 2400 + i * 120,
					seriesId: live,
					groupId: group.id,
					episode: s,
					captions: (s + i) % 3 === 0
				});
			});
		}

		/* 4. A finished event, no grouping */
		const eventStart = Date.UTC(2026, 6, 18, 15);
		const event = addSeries(
			{
				slug: 'skyforge-games-2026',
				title: 'Skyforge Games 2026',
				kind: 'event',
				status: 'ended',
				grouping: 'none',
				startedAt: new Date(eventStart),
				endedAt: at(eventStart, 2),
				poster: { type: 'art', palette: 'night', seed: 9 }
			},
			['marrowfen', 'nimbleknot', 'ferrocrest', 'cobalt-wren'],
			{
				en: 'A weekend of floating-island minigames. Who builds the best sky arena?',
				nl: 'Een weekend vol minigames op zwevende eilanden. Wie bouwt de beste luchtarena?'
			}
		);
		(['marrowfen', 'nimbleknot', 'ferrocrest', 'cobalt-wren'] as const).forEach((slug, i) => {
			addVideo({
				channel: mainChannel.get(slug)!,
				title: `Skyforge Games: ${['I Fell Off', 'Victory Lap', 'Sky Arena Tour', 'So Close'][i]}`,
				publishedAt: at(eventStart, 1 + (i % 2), i),
				durationS: 1800 + i * 300,
				seriesId: event,
				captions: i === 1
			});
		});

		/*
		 * One creator has claimed their profile, so the UI can show the "Verified creator" state.
		 * All other demo creators stay unclaimed.
		 */
		const claimedSlug: Slug = 'tidecaller-juno';
		const claimedAt = new Date(SEASON_START + 20 * DAY);
		const creatorUser = tx
			.insert(t.users)
			.values({
				googleSub: 'demo-google-sub-0001',
				name: 'Tidecaller Juno',
				creatorId: creatorId.get(claimedSlug)!,
				createdAt: claimedAt
			})
			.returning({ id: t.users.id })
			.get();
		tx.update(t.creators)
			.set({ claimedAt })
			.where(eq(t.creators.id, creatorId.get(claimedSlug)!))
			.run();
		tx.update(t.channels)
			.set({ verifiedAt: claimedAt, verifiedByUserId: creatorUser.id })
			.where(eq(t.channels.id, mainChannel.get(claimedSlug)!))
			.run();
		tx.insert(t.claims)
			.values({
				userId: creatorUser.id,
				creatorId: creatorId.get(claimedSlug)!,
				youtubeChannelId: fakeChannelId(claimedSlug),
				status: 'verified',
				createdAt: claimedAt
			})
			.run();

		/* Uploads no rule could place */
		[
			['quillby', 'My new texture pack'],
			['saffron-vale', 'Answering your questions'],
			['lumen-pike', 'Building a lighthouse in another world']
		].forEach(([slug, title], i) => {
			addVideo({
				channel: mainChannel.get(slug as Slug)!,
				title,
				publishedAt: at(SEASON_START, 10 + i * 5, 12),
				durationS: 900 + i * 120,
				seriesId: null
			});
		});

		/* Site pages (English and Dutch) */
		for (const page of PAGES) {
			const row = tx
				.insert(t.pages)
				.values({ slug: page.slug })
				.returning({ id: t.pages.id })
				.get();
			tx.insert(t.pageTranslations)
				.values(
					Object.entries(page.translations).map(([locale, tr]) => ({
						pageId: row.id,
						locale,
						title: tr.title,
						body: tr.body
					}))
				)
				.run();
		}
	});

	return {
		creators: CREATORS.length,
		series: 4,
		videos: videoCount,
		pages: PAGES.length
	};
}

const PAGES: { slug: string; translations: Record<string, { title: string; body: string }> }[] = [
	{
		slug: 'about',
		translations: {
			en: {
				title: 'About Couchcrab',
				body: `Couchcrab is a community-run, open-source fan project to watch multiplayer Minecraft series from every point of view, in the order it happened.

**Couchcrab is unofficial.** It is not affiliated with, endorsed by or connected to any creator listed on the site, Mojang or Microsoft.

- Every video plays from YouTube on the creator's own channel, so views, ads and revenue stay with the creator.
- Couchcrab never downloads, re-hosts or monetises videos.
- Creators, series and placements are maintained by the community.

*This page is demo content. Edit it in the app.*`
			},
			nl: {
				title: 'Over Couchcrab',
				body: `Couchcrab is een open-source fanproject van en voor de community om multiplayer-Minecraftseries vanuit elk perspectief te bekijken, in de volgorde waarin het gebeurde.

**Couchcrab is onofficieel.** Het is niet verbonden met, goedgekeurd door of gelinkt aan een maker op de site, Mojang of Microsoft.

- Elke video speelt af via YouTube op het kanaal van de maker zelf, dus weergaven, advertenties en inkomsten blijven bij de maker.
- Couchcrab downloadt, herhost of verdient nooit geld aan video's.
- Makers, series en plaatsingen worden door de community bijgehouden.

*Deze pagina is demo-inhoud. Pas ze aan in de app.*`
			}
		}
	},
	{
		slug: 'disclaimer',
		translations: {
			en: {
				title: 'Disclaimer',
				body: `Couchcrab is an independent fan project.

1. We are not affiliated with any creator, server, Mojang or Microsoft.
2. Videos, thumbnails, names and channel art belong to their creators.
3. Minecraft is a trademark of Mojang Synergies AB.

Are you a creator and want something corrected or removed? Use the creator request form.

*This page is demo content.*`
			},
			nl: {
				title: 'Disclaimer',
				body: `Couchcrab is een onafhankelijk fanproject.

1. We zijn niet verbonden met een maker, server, Mojang of Microsoft.
2. Video's, miniaturen, namen en kanaalafbeeldingen zijn van hun makers.
3. Minecraft is een handelsmerk van Mojang Synergies AB.

Ben je een maker en wil je iets laten verbeteren of verwijderen? Gebruik het formulier voor makers.

*Deze pagina is demo-inhoud.*`
			}
		}
	},
	{
		slug: 'accessibility',
		translations: {
			en: {
				title: 'Accessibility statement',
				body: `We want everyone to be able to use Couchcrab. We aim for **WCAG 2.2 level AA** in every theme.

## What we do

- Dark, light and high contrast themes.
- Full keyboard support with visible focus and a skip link.
- A CC badge only for captions made by the creator.

## What we can't fix

The YouTube player and the captions inside videos belong to YouTube and the creators.

*This page is demo content.*`
			},
			nl: {
				title: 'Toegankelijkheidsverklaring',
				body: `We willen dat iedereen Couchcrab kan gebruiken. We mikken op **WCAG 2.2 niveau AA** in elk thema.

## Wat we doen

- Een donker, licht en hoog-contrastthema.
- Volledige bediening met het toetsenbord, met zichtbare focus en een skiplink.
- Een CC-badge alleen voor ondertitels die de maker zelf maakte.

## Wat we niet kunnen oplossen

De YouTube-speler en de ondertitels in video's zijn van YouTube en de makers.

*Deze pagina is demo-inhoud.*`
			}
		}
	}
];

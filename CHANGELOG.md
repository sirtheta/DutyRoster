# Changelog

## [0.4.9](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.4.8...DutyRoster-v0.4.9) (2026-07-21)


### Bug Fixes

* **calendar:** shrink legend toolbar on mobile ([2b74ee1](https://github.com/sirtheta/DutyRoster/commit/2b74ee130568144847b7e90dc1c37999724a7c40))
* **logging:** wire the shared logger into remaining server actions ([799565e](https://github.com/sirtheta/DutyRoster/commit/799565e676af61f034a12534774f396c479ba800))
* **users:** stop hiding real errors when saving a user ([36b1344](https://github.com/sirtheta/DutyRoster/commit/36b13443367f4632a62da280bc96df2d78d6ac94))

## [0.4.8](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.4.7...DutyRoster-v0.4.8) (2026-07-19)


### Features

* add user manual to web app ([72b4a7d](https://github.com/sirtheta/DutyRoster/commit/72b4a7dfe35c86bfbb01d686de1921c5dd089938))


### Bug Fixes

* **auth:** derive session-cookie name from AUTH_URL protocol, not NODE_ENV ([73b81c8](https://github.com/sirtheta/DutyRoster/commit/73b81c837178b78b2d996a42ae5a61c373687870))
* **calendar:** stop toolbar tip line from causing layout jump ([dabf9ca](https://github.com/sirtheta/DutyRoster/commit/dabf9ca3bc9f0123a7a3cc07894183d801a73932))
* **export:** allow Viewer role to download Excel plan export ([81ef849](https://github.com/sirtheta/DutyRoster/commit/81ef849793f466c5173125cf0d21f087ec69a99d))
* **swaps:** prevent duplicate swap requests from a race on double-submit ([7b76345](https://github.com/sirtheta/DutyRoster/commit/7b7634585c5bd2c5e2b7d44d4c8c31e191b3078b))

## [0.4.7](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.4.6...DutyRoster-v0.4.7) (2026-07-19)


### Features

* **notifications:** allow 5-minute-precision notification times ([ed82e73](https://github.com/sirtheta/DutyRoster/commit/ed82e735a973bbe5eed252a2dcb338d0c17342e3))
* **notifications:** include app link in swap-request notifications ([ade5f54](https://github.com/sirtheta/DutyRoster/commit/ade5f548cae0eae60d68277c16f16758a3ae54f9))
* **settings:** allow a separate SMTP sender address ([#34](https://github.com/sirtheta/DutyRoster/issues/34)) ([9406b48](https://github.com/sirtheta/DutyRoster/commit/9406b4812106802759bace3ade5c351ecc6116e7))
* **swaps:** only offer duty swaps to available colleagues ([f43dc1f](https://github.com/sirtheta/DutyRoster/commit/f43dc1fe56dd8ff8572afe81081f04cb2cb47085))
* **users:** let admins test a user's notification channel ([c8a7cb4](https://github.com/sirtheta/DutyRoster/commit/c8a7cb457d1ae5978d5cb5c3402d6eba9c0ea995))


### Bug Fixes

* **calendar:** allow moving non-Dienst entries within the same user ([ab780ac](https://github.com/sirtheta/DutyRoster/commit/ab780acfce69fa54ced20a6afb36b991e198cde7))
* load env.local in development when seeding database ([3fb2ca4](https://github.com/sirtheta/DutyRoster/commit/3fb2ca4fce73e099c2a47db17ffe2dd9de37d4b8))
* **settings:** show connection test result inline instead of toast-only ([fc977ad](https://github.com/sirtheta/DutyRoster/commit/fc977ad7fd0ec596b980af227c93e7209cb9d63c))

## [0.4.6](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.4.5...DutyRoster-v0.4.6) (2026-07-18)


### Bug Fixes

* **calendar:** allow shift+drag to rubber-band select from an occupied cell ([86c2c7b](https://github.com/sirtheta/DutyRoster/commit/86c2c7bf20333b03a166c8b6f2336f9d37187641))
* **calendar:** keep entry type colors consistent across user rows ([d0d462b](https://github.com/sirtheta/DutyRoster/commit/d0d462b9aee30b16ef56d0f10797e6f5dec3be11))

## [0.4.5](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.4.4...DutyRoster-v0.4.5) (2026-07-18)


### Features

* **users:** hide terminated users from the list once their exit year ends ([b3784b2](https://github.com/sirtheta/DutyRoster/commit/b3784b2124d83ad00e9219dfb6e622df973a01d9))


### Bug Fixes

* **users:** keep terminated users visible on their exit year's calendar ([21546f1](https://github.com/sirtheta/DutyRoster/commit/21546f181eb6b7d1edd7cab9e461e2a81da00211))

## [0.4.4](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.4.3...DutyRoster-v0.4.4) (2026-07-18)


### Features

* add favicon ([601379f](https://github.com/sirtheta/DutyRoster/commit/601379fb4f79127874c0ebae601872ebf53dd852))
* **swaps:** broadcast swap requests to all colleagues, multiline comments ([dd6cb87](https://github.com/sirtheta/DutyRoster/commit/dd6cb8773b2d3a83d2505c0a18c197f7e2faed93))

## [0.4.3](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.4.2...DutyRoster-v0.4.3) (2026-07-17)


### Features

* **auth:** self-service password reset via emailed link ([cd5d268](https://github.com/sirtheta/DutyRoster/commit/cd5d268b89b63bac7a4185e6738b88c24269cfee))
* **backup:** nightly SQLite backup via VACUUM INTO with configurable retention ([22d46c1](https://github.com/sirtheta/DutyRoster/commit/22d46c12fd6a7eb31a68c2dcb3141f4fb7a16637))
* **calendar:** highlight current day and scroll to it on load ([38eac6a](https://github.com/sirtheta/DutyRoster/commit/38eac6a8912283f22e823c4a80a2b2efa4e72f77))
* **calendar:** show uncovered weeks directly in the calendar view ([6d54a92](https://github.com/sirtheta/DutyRoster/commit/6d54a923e5dd5c10b18ec528b6a727ac2975b321))
* **dashboard:** duty overview with current, next, and uncovered weeks ([22848ac](https://github.com/sirtheta/DutyRoster/commit/22848acca456263158c47651ac561da4b5029477))
* **help:** add in-app setup guides for Telegram bot and chat ID ([4a017e3](https://github.com/sirtheta/DutyRoster/commit/4a017e349e407528c840471b6554b322e1a32bf6))
* **ical:** make Ferien inclusion in the iCal feed configurable per user ([#25](https://github.com/sirtheta/DutyRoster/issues/25)) ([33caeb1](https://github.com/sirtheta/DutyRoster/commit/33caeb16c47c40d33d81dfe8009e423c951e7f83))
* **notifications:** allow selecting Email and Telegram together, fix settings dialog UX ([0200eaf](https://github.com/sirtheta/DutyRoster/commit/0200eafa199adfa28517c0e2029a974bbe70873b))
* **rotation:** continue the rotation across year boundaries ([8f0d75c](https://github.com/sirtheta/DutyRoster/commit/8f0d75cd7babc3713ef570b5aac30f6ad233dafa))
* **rotation:** cover blocked weeks with the next available user and report uncovered weeks ([9c6f3ad](https://github.com/sirtheta/DutyRoster/commit/9c6f3ad89a2563fd8a881aaa6b290a161bb5a7ef))
* **settings:** show Telegram token status and add connection test ([00e985a](https://github.com/sirtheta/DutyRoster/commit/00e985a998f74204af3b0b58d9579cc3fae30a02))
* **swap:** duty swap requests between users ([df5735d](https://github.com/sirtheta/DutyRoster/commit/df5735dd2d2ecdfe49173e085874b807c5075e43))


### Bug Fixes

* **audit:** record affected cells in bulk entry audit logs ([276a895](https://github.com/sirtheta/DutyRoster/commit/276a8956cae6bf1b00fdc220f12de607a7919ae0))
* **calendar:** chunk bulk cell lookups to avoid the SQLite parameter limit ([9c8eaac](https://github.com/sirtheta/DutyRoster/commit/9c8eaac8daea161a1b47e9b4331e4dc2edc9f714))
* **calendar:** stick legend toolbar below app header, not behind it ([0a2cba9](https://github.com/sirtheta/DutyRoster/commit/0a2cba973c7d049cb3c537aa91af47ac7f4fc4d7))
* **email:** prevent mail clients from auto-linking dates in notification body ([d829fc8](https://github.com/sirtheta/DutyRoster/commit/d829fc821ea7fc2be2db309004aa91d28d5ed060))
* **notifications:** cap delivery retries and prune old notification/audit rows ([e6cb8af](https://github.com/sirtheta/DutyRoster/commit/e6cb8afc506c8a61b98fedc165c7e7e8247ce338))
* **notifications:** evaluate notify schedule in the app timezone ([3b9e39b](https://github.com/sirtheta/DutyRoster/commit/3b9e39b09337559b567d0c9139d4ee622d502f40))
* **notifications:** show Swiss date format and date range for duty week ([741db11](https://github.com/sirtheta/DutyRoster/commit/741db111ce22fa0a60bc717201c0e7e088fab555))

## [0.4.2](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.4.1...DutyRoster-v0.4.2) (2026-07-17)


### Features

* add version and copyright footer ([#20](https://github.com/sirtheta/DutyRoster/issues/20)) ([1a1c54f](https://github.com/sirtheta/DutyRoster/commit/1a1c54f1ef5d9fc7cb2bf376e6f2388cf6753904))
* **calendar:** add drag-to-select and per-user row tinting ([#23](https://github.com/sirtheta/DutyRoster/issues/23)) ([7d0460a](https://github.com/sirtheta/DutyRoster/commit/7d0460a716a567e2eaae03eed1ebdc398dc35d34))
* **settings:** add SMTP connection test button ([#22](https://github.com/sirtheta/DutyRoster/issues/22)) ([de110c9](https://github.com/sirtheta/DutyRoster/commit/de110c9b65cdefee0ed1cf38e70962c523030e05))
* **ui:** align design system with CustomerManagement ([262762c](https://github.com/sirtheta/DutyRoster/commit/262762c2e687acb90af6cfb45f68698d72794b13))
* **users:** add exit-date termination flow that preserves duty history ([#18](https://github.com/sirtheta/DutyRoster/issues/18)) ([616f890](https://github.com/sirtheta/DutyRoster/commit/616f890b8c1d701163b557c378eb59688c699688))
* **users:** implement rotation order insertion with automatic shifting ([#21](https://github.com/sirtheta/DutyRoster/issues/21)) ([80711fb](https://github.com/sirtheta/DutyRoster/commit/80711fb9ff9e8eed1e1dfac6cf9cd1a725fe3509))


### Bug Fixes

* **auth:** default session duration to 7 days and UI improvements ([8aa9334](https://github.com/sirtheta/DutyRoster/commit/8aa9334adf96ee0d3c881e3298b59ec0bdbdb710))

## [0.4.1](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.4.0...DutyRoster-v0.4.1) (2026-07-16)


### Bug Fixes

* **auth:** refresh session name/email on periodic re-check ([8cef2a3](https://github.com/sirtheta/DutyRoster/commit/8cef2a3791d919defd1d512fcdbdd8c08d6e386a))
* **notifications:** let every user manage and test their own notification settings ([40d3b99](https://github.com/sirtheta/DutyRoster/commit/40d3b999d78fc0a3b4e5be88ec2204d6d65af5cd))

## [0.4.0](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.3.0...DutyRoster-v0.4.0) (2026-07-16)


### Features

* **calendar:** add realtime sync via SSE and harden concurrent duty moves ([1c7f6c3](https://github.com/sirtheta/DutyRoster/commit/1c7f6c3c8277241dc13ecbdd2ed1b3b26c25497d))


### Bug Fixes

* allow editor to move and edit other users planing (only S) ([0d69970](https://github.com/sirtheta/DutyRoster/commit/0d699707626e104e10f8a74c190f3d8f3bd0b3fa))
* **auth:** repair logout and add password visibility toggle + self-service change ([306989a](https://github.com/sirtheta/DutyRoster/commit/306989ad5234681d51276a77832a989e322ae306))
* **calendar:** stop legend toolbar from reflowing during cell selection ([5ed76bc](https://github.com/sirtheta/DutyRoster/commit/5ed76bcd9141b2a2a91fe5f429dbfbeec3306b8c))
* renaming ([50cfb5f](https://github.com/sirtheta/DutyRoster/commit/50cfb5f94bd77b38a2b28802b00be971f152c653))

## [0.3.0](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.2.0...DutyRoster-v0.3.0) (2026-07-16)


### Features

* **audit:** add admin audit-log page ([#7](https://github.com/sirtheta/DutyRoster/issues/7)) ([2603680](https://github.com/sirtheta/DutyRoster/commit/260368020d63b481080d96ecfc61c77a33d8d9bf))
* **calendar:** always show legend with click-to-paint categories ([3df9116](https://github.com/sirtheta/DutyRoster/commit/3df911689fb0d8fc543fb1fd2ffa12383ee6c01f))
* **calendar:** drag multiple selected cells together with live drop preview ([3623efe](https://github.com/sirtheta/DutyRoster/commit/3623efe09a46b05694f502c004c264dcefe22f97))
* **calendar:** show weekday abbreviation above each date ([ebaf5a0](https://github.com/sirtheta/DutyRoster/commit/ebaf5a00881e065f7807798f3bafdeaa89a71907))
* **holidays:** display dates in Swiss format (DD.MM.YYYY) ([22ce19f](https://github.com/sirtheta/DutyRoster/commit/22ce19f9efaead60998dcdb06e9ae5fd8c1e9af1))
* **holidays:** group consecutive holidays into ranges in list view ([d10ff9b](https://github.com/sirtheta/DutyRoster/commit/d10ff9b6227d178e91fc46d633c30eb88c34e502))
* **settings:** add devmode trigger to test email/Telegram notifications ([a671d39](https://github.com/sirtheta/DutyRoster/commit/a671d3990cf7c5a07f503abaf0235baf7f16bea8))
* **ui:** add mobile nav drawer and stacked-month calendar view ([04738ab](https://github.com/sirtheta/DutyRoster/commit/04738ab1bd1971d7d0976c287e7a0b3b1c059bf4))


### Bug Fixes

* **calendar:** support touch drag-and-drop for moving entries ([fcf1785](https://github.com/sirtheta/DutyRoster/commit/fcf17853072a51c1f19ed526192179ca2a5b8ddb))
* **dev:** allow LAN origins to reach the dev server ([9bc2e4a](https://github.com/sirtheta/DutyRoster/commit/9bc2e4a0d7e32902984df6592ecc324708093ae5))
* excel export ([46a29bf](https://github.com/sirtheta/DutyRoster/commit/46a29bf8c246f9e8ee7618bf7bc7799e598cadd9))
* **security:** remediate all findings from the security review  ([#6](https://github.com/sirtheta/DutyRoster/issues/6)) ([9c987fe](https://github.com/sirtheta/DutyRoster/commit/9c987fe16bfa1bdaa224482659333856d8024876))
* update dashboard chart ([bf86009](https://github.com/sirtheta/DutyRoster/commit/bf86009908678c0fd469bccadd40a08b5e9e11d2))

## [0.2.0](https://github.com/sirtheta/DutyRoster/compare/DutyRoster.web-vv0.1.0...DutyRoster.web-vv0.2.0) (2026-07-15)


### Features

* **calendar:** always show legend with click-to-paint categories ([3df9116](https://github.com/sirtheta/DutyRoster/commit/3df911689fb0d8fc543fb1fd2ffa12383ee6c01f))
* **calendar:** drag multiple selected cells together with live drop preview ([3623efe](https://github.com/sirtheta/DutyRoster/commit/3623efe09a46b05694f502c004c264dcefe22f97))
* **calendar:** show weekday abbreviation above each date ([ebaf5a0](https://github.com/sirtheta/DutyRoster/commit/ebaf5a00881e065f7807798f3bafdeaa89a71907))
* **holidays:** display dates in Swiss format (DD.MM.YYYY) ([22ce19f](https://github.com/sirtheta/DutyRoster/commit/22ce19f9efaead60998dcdb06e9ae5fd8c1e9af1))
* **holidays:** group consecutive holidays into ranges in list view ([d10ff9b](https://github.com/sirtheta/DutyRoster/commit/d10ff9b6227d178e91fc46d633c30eb88c34e502))
* **settings:** add devmode trigger to test email/Telegram notifications ([a671d39](https://github.com/sirtheta/DutyRoster/commit/a671d3990cf7c5a07f503abaf0235baf7f16bea8))
* **ui:** add mobile nav drawer and stacked-month calendar view ([04738ab](https://github.com/sirtheta/DutyRoster/commit/04738ab1bd1971d7d0976c287e7a0b3b1c059bf4))


### Bug Fixes

* **calendar:** support touch drag-and-drop for moving entries ([fcf1785](https://github.com/sirtheta/DutyRoster/commit/fcf17853072a51c1f19ed526192179ca2a5b8ddb))
* **dev:** allow LAN origins to reach the dev server ([9bc2e4a](https://github.com/sirtheta/DutyRoster/commit/9bc2e4a0d7e32902984df6592ecc324708093ae5))
* excel export ([46a29bf](https://github.com/sirtheta/DutyRoster/commit/46a29bf8c246f9e8ee7618bf7bc7799e598cadd9))
* update dashboard chart ([bf86009](https://github.com/sirtheta/DutyRoster/commit/bf86009908678c0fd469bccadd40a08b5e9e11d2))

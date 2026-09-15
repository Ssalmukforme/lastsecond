// How LAST SECOND appears in ssalmuk_ranking. Must match supabase/ranking-boards.sql (checked by tests/ranking.test.js).
export const RANKING_GAME = 'lastsecond';
export const RANKING_BOARD = 'ruins';
// Survival time in milliseconds; longer wins. Capped at two hours as a sanity bound.
export const BOARDS = [{ id: RANKING_BOARD, name: '고요한 폐허', higherIsBetter: true, min: 0, max: 7_200_000 }];

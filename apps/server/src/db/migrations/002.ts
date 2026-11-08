export const sql002 = `
CREATE TABLE discovery_candidates(id TEXT PRIMARY KEY, mint TEXT NOT NULL UNIQUE, dismissed INTEGER NOT NULL DEFAULT 0 CHECK(dismissed IN (0,1)), data_json TEXT NOT NULL CHECK(json_valid(data_json)));
CREATE INDEX discovery_candidates_dismissed ON discovery_candidates(dismissed);
`;

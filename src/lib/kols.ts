export type Kol = {
  id: string;
  handle: string;
  name: string;
  ticker: string;
  wallet: string;
  image: string;
  x: string;
  avatar: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  holders: number;
  winRate: number;
  pnl30d: number;
  trades30d: number;
  avgHold: string;
  chain: string;
  bio: string;
  series: number[];
};

type Seed = {
  id: string;
  name: string;
  ticker: string;
  wallet: string;
  image: string;
  x: string;
  handle: string;
  hue: number;
};

/** Traders imported from the kolscan.io leaderboard. All listings open at $0.00. */
const SEEDS: Seed[] = [
  { id: "btf4a2", name: "Kev", ticker: "KEV", wallet: "BTf4A2exGK9BCVDNzy65b9dUzXgMqB4weVkvTMFQsadd", image: "https://cdn.kolscan.io/profiles/BTf4A2exGK9BCVDNzy65b9dUzXgMqB4weVkvTMFQsadd.png", x: "https://x.com/Kev", handle: "@Kev", hue: 61 },
  { id: "bi4rd5", name: "theo", ticker: "THEO", wallet: "Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt", image: "https://cdn.kolscan.io/profiles/Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt.png", x: "https://x.com/theo", handle: "@theo", hue: 182 },
  { id: "98t65w", name: "Leck", ticker: "LECK", wallet: "98T65wcMEjoNLDTJszBHGZEX75QRe8QaANXokv4yw3Mp", image: "https://cdn.kolscan.io/profiles/98T65wcMEjoNLDTJszBHGZEX75QRe8QaANXokv4yw3Mp.png", x: "https://x.com/Leck", handle: "@Leck", hue: 168 },
  { id: "jdd3hy", name: "West", ticker: "WEST", wallet: "JDd3hy3gQn2V982mi1zqhNqUw1GfV2UL6g76STojCJPN", image: "https://cdn.kolscan.io/profiles/JDd3hy3gQn2V982mi1zqhNqUw1GfV2UL6g76STojCJPN.png", x: "https://x.com/West", handle: "@West", hue: 33 },
  { id: "8fskll", name: "Stigman", ticker: "STIG", wallet: "8fsKLLtvKNanL4ginCaiRS6UfeemY11rSf8U8fN1dJw4", image: "https://cdn.kolscan.io/profiles/8fsKLLtvKNanL4ginCaiRS6UfeemY11rSf8U8fN1dJw4.png", x: "https://x.com/Stigman", handle: "@Stigman", hue: 34 },
  { id: "cyae1v", name: "Cented", ticker: "CENT", wallet: "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o", image: "https://cdn.kolscan.io/profiles/CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o.png", x: "https://x.com/Cented", handle: "@Cented", hue: 137 },
  { id: "d1h83u", name: "Jeets", ticker: "JEET", wallet: "D1H83ueSw5Nxy5okxH7VBfV4jRnqAK5Mm1tm3JAj3m5t", image: "https://cdn.kolscan.io/profiles/D1H83ueSw5Nxy5okxH7VBfV4jRnqAK5Mm1tm3JAj3m5t.png", x: "https://x.com/Jeets", handle: "@Jeets", hue: 114 },
  { id: "djm7tu", name: "LUKEY \u2723", ticker: "LUKE", wallet: "DjM7Tu7whh6P3pGVBfDzwXAx2zaw51GJWrJE3PwtuN7s", image: "https://cdn.kolscan.io/profiles/DjM7Tu7whh6P3pGVBfDzwXAx2zaw51GJWrJE3PwtuN7s.png", x: "https://x.com/LUKEY✣", handle: "@LUKEY✣", hue: 78 },
  { id: "8mava9", name: "Daumen", ticker: "DAUM", wallet: "8MaVa9kdt3NW4Q5HyNAm1X5LbR8PQRVDc1W8NMVK88D5", image: "https://cdn.kolscan.io/profiles/8MaVa9kdt3NW4Q5HyNAm1X5LbR8PQRVDc1W8NMVK88D5.png", x: "https://x.com/Daumen", handle: "@Daumen", hue: 296 },
  { id: "4fzfck", name: "Rilsio", ticker: "RILS", wallet: "4fZFcK8ms3bFMpo1ACzEUz8bH741fQW4zhAMGd5yZMHu", image: "https://cdn.kolscan.io/profiles/4fZFcK8ms3bFMpo1ACzEUz8bH741fQW4zhAMGd5yZMHu.png", x: "https://x.com/Rilsio", handle: "@Rilsio", hue: 26 },
  { id: "4yzpsz", name: "xunle", ticker: "XUNL", wallet: "4YzpSZpxDdjNf3unjkCtdWEsz2FL5mok7e5XQaDNqry8", image: "https://cdn.kolscan.io/profiles/4YzpSZpxDdjNf3unjkCtdWEsz2FL5mok7e5XQaDNqry8.png", x: "https://x.com/xunle", handle: "@xunle", hue: 179 },
  { id: "9bs2xg", name: "woopig\ud83e\uddd9\ud83c\udffb\u200d\u2642\ufe0f", ticker: "WOOP", wallet: "9Bs2XgZynPdMfbpn3HQX8NKWLToPDwGrMHRbZruwbyPD", image: "https://cdn.kolscan.io/profiles/9Bs2XgZynPdMfbpn3HQX8NKWLToPDwGrMHRbZruwbyPD.png", x: "https://x.com/woopig🧙🏻‍♂️", handle: "@woopig🧙🏻‍♂️", hue: 133 },
  { id: "j38fhf", name: "Nilla", ticker: "NILL", wallet: "j38fhfqWsJyt8hzym48P8QMsXWx1FfLUxQwuor7Ti4o", image: "https://cdn.kolscan.io/profiles/j38fhfqWsJyt8hzym48P8QMsXWx1FfLUxQwuor7Ti4o.png", x: "https://x.com/Nilla", handle: "@Nilla", hue: 273 },
  { id: "951wq3", name: "jrus", ticker: "JRUS", wallet: "951wq3qDowjKHaycrNaiRB5WpovYVKXnqhnrcKPh46zt", image: "https://cdn.kolscan.io/profiles/951wq3qDowjKHaycrNaiRB5WpovYVKXnqhnrcKPh46zt.png", x: "https://x.com/jrus", handle: "@jrus", hue: 212 },
  { id: "gja1he", name: "Latuche", ticker: "LATU", wallet: "GJA1HEbxGnqBhBifH9uQauzXSB53to5rhDrzmKxhSU65", image: "https://cdn.kolscan.io/profiles/GJA1HEbxGnqBhBifH9uQauzXSB53to5rhDrzmKxhSU65.png", x: "https://x.com/Latuche", handle: "@Latuche", hue: 48 },
  { id: "a4kxlr", name: "leviilol", ticker: "LEVI", wallet: "A4KxLRntS2V6giboMyfDtwoysmsKPaz8Juw6CwHYxVXn", image: "https://cdn.kolscan.io/profiles/A4KxLRntS2V6giboMyfDtwoysmsKPaz8Juw6CwHYxVXn.png", x: "https://x.com/leviilol", handle: "@leviilol", hue: 314 },
  { id: "rassh7", name: "Rasta", ticker: "RAST", wallet: "RaSSH7hMwLKtMT96xZyY4JwHRCCNYvvNeBh6AaFMqdA", image: "https://cdn.kolscan.io/profiles/RaSSH7hMwLKtMT96xZyY4JwHRCCNYvvNeBh6AaFMqdA.png", x: "https://x.com/Rasta", handle: "@Rasta", hue: 123 },
  { id: "9r1ben", name: "Mazino", ticker: "MAZI", wallet: "9r1BenK1nPvkZyD88q3e6bTKjfqDcLjxnXn9ovreDL52", image: "https://cdn.kolscan.io/profiles/9r1BenK1nPvkZyD88q3e6bTKjfqDcLjxnXn9ovreDL52.png", x: "https://x.com/Mazino", handle: "@Mazino", hue: 329 },
  { id: "bi8gjp", name: "\ufe0e", ticker: "BI8G", wallet: "Bi8gjp6g7hYmLJ2gsHbtdMwHyin4js1efTzDdJSQ6m4T", image: "https://cdn.kolscan.io/profiles/Bi8gjp6g7hYmLJ2gsHbtdMwHyin4js1efTzDdJSQ6m4T.png", x: "https://x.com/︎", handle: "@︎", hue: 277 },
  { id: "862tys", name: "Wugi", ticker: "WUGI", wallet: "862TYSvRYoiHAK3F3WwTRYAfuGiQaGdxedN9AGvRGWo2", image: "https://cdn.kolscan.io/profiles/862TYSvRYoiHAK3F3WwTRYAfuGiQaGdxedN9AGvRGWo2.png", x: "https://x.com/Wugi", handle: "@Wugi", hue: 199 },
  { id: "f8wtsr", name: "kz", ticker: "KZ", wallet: "F8WtsrLzexRkjv11b1sgA3Qj7E889RGYa1jFLGoPwKTB", image: "https://cdn.kolscan.io/profiles/F8WtsrLzexRkjv11b1sgA3Qj7E889RGYa1jFLGoPwKTB.png", x: "https://x.com/kz", handle: "@kz", hue: 58 },
  { id: "cxvjew", name: "Swan", ticker: "SWAN", wallet: "CXVJewdc79TYR55sz4SGLSWUPz3r4LBJ9Mn93bZ8ZyAz", image: "https://cdn.kolscan.io/profiles/CXVJewdc79TYR55sz4SGLSWUPz3r4LBJ9Mn93bZ8ZyAz.png", x: "https://x.com/Swan", handle: "@Swan", hue: 80 },
  { id: "aueqxh", name: "rise_crypt", ticker: "RISE", wallet: "AUEQxhkAVz71w2WBa9BYSoZrydhYNJaKmfNomoNs9E4t", image: "https://cdn.kolscan.io/profiles/AUEQxhkAVz71w2WBa9BYSoZrydhYNJaKmfNomoNs9E4t.png", x: "https://x.com/rise_crypt", handle: "@rise_crypt", hue: 94 },
  { id: "4bdkax", name: "Jijo", ticker: "JIJO", wallet: "4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk", image: "https://cdn.kolscan.io/profiles/4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk.png", x: "https://x.com/Jijo", handle: "@Jijo", hue: 214 },
  { id: "36a6me", name: "Mel", ticker: "MEL", wallet: "36A6mEN5rYJdVTb6fMqVvG6ez8g2mTYdr1omWcQ1kDKG", image: "https://cdn.kolscan.io/profiles/36A6mEN5rYJdVTb6fMqVvG6ez8g2mTYdr1omWcQ1kDKG.png", x: "https://x.com/Mel", handle: "@Mel", hue: 165 },
  { id: "3uz65g", name: "Felix", ticker: "FELI", wallet: "3uz65G8e463MA5FxcSu1rTUyWRtrRLRZYskKtEHHj7qn", image: "https://cdn.kolscan.io/profiles/3uz65G8e463MA5FxcSu1rTUyWRtrRLRZYskKtEHHj7qn.png", x: "https://x.com/Felix", handle: "@Felix", hue: 355 },
  { id: "cukfkd", name: "Baraka", ticker: "BARA", wallet: "CUKFKdJw7F91bZBbtAJMrLLxqtVigVSJhx644EFnCnw", image: "https://cdn.kolscan.io/profiles/CUKFKdJw7F91bZBbtAJMrLLxqtVigVSJhx644EFnCnw.png", x: "https://x.com/Baraka", handle: "@Baraka", hue: 206 },
  { id: "by58z7", name: "JB", ticker: "JB", wallet: "BY58Z7N5Adarkx5ed78AzKvR7Kxrq795aa1boZsYyVBT", image: "https://cdn.kolscan.io/profiles/BY58Z7N5Adarkx5ed78AzKvR7Kxrq795aa1boZsYyVBT.png", x: "https://x.com/JB", handle: "@JB", hue: 95 },
  { id: "6edavs", name: "Cowboy\ud83d\udd36BNB", ticker: "COWB", wallet: "6EDaVsS6enYgJ81tmhEkiKFcb4HuzPUVFZeom6PHUqN3", image: "https://cdn.kolscan.io/profiles/6EDaVsS6enYgJ81tmhEkiKFcb4HuzPUVFZeom6PHUqN3.png", x: "https://x.com/Cowboy🔶BNB", handle: "@Cowboy🔶BNB", hue: 72 },
  { id: "kilogf", name: "kilo", ticker: "KILO", wallet: "kiLogfWUXp7nby7Xi6R9t7u8ERQyRdAzg6wBjvuE49u", image: "https://cdn.kolscan.io/profiles/kiLogfWUXp7nby7Xi6R9t7u8ERQyRdAzg6wBjvuE49u.png", x: "https://x.com/kilo", handle: "@kilo", hue: 350 },
  { id: "4sausq", name: "Scharo", ticker: "SCHA", wallet: "4sAUSQFdvWRBxR8UoLBYbw8CcXuwXWxnN8pXa4mtm5nU", image: "https://cdn.kolscan.io/profiles/4sAUSQFdvWRBxR8UoLBYbw8CcXuwXWxnN8pXa4mtm5nU.png", x: "https://x.com/Scharo", handle: "@Scharo", hue: 297 },
  { id: "fhssft", name: "Spike", ticker: "SPIK", wallet: "FhsSfTSHok3ryVfyuLSD1t9frc4c1ymyCr3S11Ci718z", image: "https://cdn.kolscan.io/profiles/FhsSfTSHok3ryVfyuLSD1t9frc4c1ymyCr3S11Ci718z.png", x: "https://x.com/Spike", handle: "@Spike", hue: 144 },
  { id: "egjcs3", name: "Legend", ticker: "LEGE", wallet: "EgjCS3ULUCU5JN83XumirPr6171zvN5i6wc12SDiVGX3", image: "https://cdn.kolscan.io/profiles/EgjCS3ULUCU5JN83XumirPr6171zvN5i6wc12SDiVGX3.png", x: "https://x.com/Legend", handle: "@Legend", hue: 178 },
  { id: "7wc98b", name: "sonder\uc190\ub354", ticker: "SOND", wallet: "7wc98B9PgZEmbaidybNYeyaBeKorzaN8DykMZ8nZiZ1m", image: "https://cdn.kolscan.io/profiles/7wc98B9PgZEmbaidybNYeyaBeKorzaN8DykMZ8nZiZ1m.png", x: "https://x.com/sonder손더", handle: "@sonder손더", hue: 175 },
  { id: "4s2wzr", name: "jester", ticker: "JEST", wallet: "4s2WzRLa35FB58bZY1i4CN3WoywJeuYrGYHnTKFsT23z", image: "https://cdn.kolscan.io/profiles/4s2WzRLa35FB58bZY1i4CN3WoywJeuYrGYHnTKFsT23z.png", x: "https://x.com/jester", handle: "@jester", hue: 243 },
  { id: "9eypam", name: "Connor", ticker: "CONN", wallet: "9EyPAMyQvXaUWFxd2uQHvG8vpkKs33YdXvDvwmRXrUiH", image: "https://cdn.kolscan.io/profiles/9EyPAMyQvXaUWFxd2uQHvG8vpkKs33YdXvDvwmRXrUiH.png", x: "https://x.com/Connor", handle: "@Connor", hue: 93 },
  { id: "2net6e", name: "rambo", ticker: "RAMB", wallet: "2net6etAtTe3Rbq2gKECmQwnzcKVXRaLcHy2Zy1iCiWz", image: "https://cdn.kolscan.io/profiles/2net6etAtTe3Rbq2gKECmQwnzcKVXRaLcHy2Zy1iCiWz.png", x: "https://x.com/rambo", handle: "@rambo", hue: 325 },
  { id: "9fnz4m", name: "Danny", ticker: "DANN", wallet: "9FNz4MjPUmnJqTf6yEDbL1D4SsHVh7uA8zRHhR5K138r", image: "https://cdn.kolscan.io/profiles/9FNz4MjPUmnJqTf6yEDbL1D4SsHVh7uA8zRHhR5K138r.png", x: "https://x.com/Danny", handle: "@Danny", hue: 189 },
  { id: "4eszfz", name: "dash", ticker: "DASH", wallet: "4ESzFZUWUdr2GsgHBVeQKuzAmBWS5sRSaXw6PZH2EAau", image: "https://cdn.kolscan.io/profiles/4ESzFZUWUdr2GsgHBVeQKuzAmBWS5sRSaXw6PZH2EAau.png", x: "https://x.com/dash", handle: "@dash", hue: 187 },
  { id: "4esy8h", name: "prosciutto", ticker: "PROS", wallet: "4EsY8HQB4Ak65diFrSHjwWhKSGC8sKmnzyusM993gk2w", image: "https://cdn.kolscan.io/profiles/4EsY8HQB4Ak65diFrSHjwWhKSGC8sKmnzyusM993gk2w.png", x: "https://x.com/prosciutto", handle: "@prosciutto", hue: 341 },
  { id: "91sp85", name: "hood", ticker: "HOOD", wallet: "91sP85Ds9A4EXJ3gU3iHyLtUNJimxz8LrxRb2qhBNod9", image: "https://cdn.kolscan.io/profiles/91sP85Ds9A4EXJ3gU3iHyLtUNJimxz8LrxRb2qhBNod9.png", x: "https://x.com/hood", handle: "@hood", hue: 125 },
  { id: "23wq7b", name: "Cope", ticker: "COPE", wallet: "23wQ7bodYreW3qhnh2YrW8dMkTYSkHHJqGcsiYEJS3Pr", image: "https://cdn.kolscan.io/profiles/23wQ7bodYreW3qhnh2YrW8dMkTYSkHHJqGcsiYEJS3Pr.png", x: "https://x.com/Cope", handle: "@Cope", hue: 158 },
  { id: "bcnqsp", name: "kreo", ticker: "KREO", wallet: "BCnqsPEtA1TkgednYEebRpkmwFRJDCjMQcKZMMtEdArc", image: "https://cdn.kolscan.io/profiles/BCnqsPEtA1TkgednYEebRpkmwFRJDCjMQcKZMMtEdArc.png", x: "https://x.com/kreo", handle: "@kreo", hue: 184 },
  { id: "jaunzn", name: "Pengu \ud83d\udcab", ticker: "PENG", wallet: "JAunzNqs3bVBcWDjDxfq9rgLzJMCadNXoaCgfzLGMtYs", image: "https://cdn.kolscan.io/profiles/JAunzNqs3bVBcWDjDxfq9rgLzJMCadNXoaCgfzLGMtYs.png", x: "https://x.com/Pengu💫", handle: "@Pengu💫", hue: 180 },
  { id: "3su8wj", name: "Mak", ticker: "MAK", wallet: "3SU8wjyKGsKZWdxVfak6gkApBqZ8twP613HDGc8Httzr", image: "https://cdn.kolscan.io/profiles/3SU8wjyKGsKZWdxVfak6gkApBqZ8twP613HDGc8Httzr.png", x: "https://x.com/Mak", handle: "@Mak", hue: 206 },
  { id: "922vvm", name: "Zuki", ticker: "ZUKI", wallet: "922VvmmYDHV9KMTJJ71Y5Yd3Vn7cfJuFasLNSsZPygrG", image: "https://cdn.kolscan.io/profiles/922VvmmYDHV9KMTJJ71Y5Yd3Vn7cfJuFasLNSsZPygrG.png", x: "https://x.com/Zuki", handle: "@Zuki", hue: 97 },
  { id: "faicxn", name: "radiance", ticker: "RADI", wallet: "FAicXNV5FVqtfbpn4Zccs71XcfGeyxBSGbqLDyDJZjke", image: "https://cdn.kolscan.io/profiles/FAicXNV5FVqtfbpn4Zccs71XcfGeyxBSGbqLDyDJZjke.png", x: "https://x.com/radiance", handle: "@radiance", hue: 29 },
  { id: "atpsex", name: "merky", ticker: "MERK", wallet: "ATpSExwhE2x1H7rv6Uoi4TJdzGz15LjDXNzhV6pjDVYi", image: "https://cdn.kolscan.io/profiles/ATpSExwhE2x1H7rv6Uoi4TJdzGz15LjDXNzhV6pjDVYi.png", x: "https://x.com/merky", handle: "@merky", hue: 39 },
  { id: "dtdha4", name: "sadizmed", ticker: "SADI", wallet: "DTdHa4auX68jFtXv9wkzMYCahg295AnRuwvm6moW6meZ", image: "https://cdn.kolscan.io/profiles/DTdHa4auX68jFtXv9wkzMYCahg295AnRuwvm6moW6meZ.png", x: "https://x.com/sadizmed", handle: "@sadizmed", hue: 195 },
  { id: "xyzfhx", name: "Gasp", ticker: "GASP", wallet: "xyzfhxfy8NhfeNG3Um3WaUvFXzNuHkrhrZMD8dsStB6", image: "https://cdn.kolscan.io/profiles/xyzfhxfy8NhfeNG3Um3WaUvFXzNuHkrhrZMD8dsStB6.png", x: "https://x.com/Gasp", handle: "@Gasp", hue: 20 },
  { id: "8nqtxp", name: "dov 7", ticker: "DOV7", wallet: "8nqtxpFpuXwfXG4pBLsDkkuMMPK9FjSkBMCn542HiM3v", image: "https://cdn.kolscan.io/profiles/8nqtxpFpuXwfXG4pBLsDkkuMMPK9FjSkBMCn542HiM3v.png", x: "https://x.com/dov7", handle: "@dov7", hue: 1 },
  { id: "6s8gez", name: "Nyhrox", ticker: "NYHR", wallet: "6S8GezkxYUfZy9JPtYnanbcZTMB87Wjt1qx3c6ELajKC", image: "https://cdn.kolscan.io/profiles/6S8GezkxYUfZy9JPtYnanbcZTMB87Wjt1qx3c6ELajKC.png", x: "https://x.com/Nyhrox", handle: "@Nyhrox", hue: 132 },
  { id: "daedbm", name: "Fox \ud83e\udd8a", ticker: "FOX", wallet: "DAEdBmTPEKM6xkwfzC3d411QUe6coKpkND6UURa4CvHC", image: "https://cdn.kolscan.io/profiles/DAEdBmTPEKM6xkwfzC3d411QUe6coKpkND6UURa4CvHC.png", x: "https://x.com/Fox🦊", handle: "@Fox🦊", hue: 135 },
  { id: "5zuv8e", name: "Doji", ticker: "DOJI", wallet: "5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg", image: "https://cdn.kolscan.io/profiles/5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg.png", x: "https://x.com/Doji", handle: "@Doji", hue: 267 },
  { id: "4vw54b", name: "decu", ticker: "DECU", wallet: "4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9", image: "https://cdn.kolscan.io/profiles/4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9.png", x: "https://x.com/decu", handle: "@decu", hue: 307 },
  { id: "gfxqes", name: "Spuno", ticker: "SPUN", wallet: "GfXQesPe3Zuwg8JhAt6Cg8euJDTVx751enp9EQQmhzPH", image: "https://cdn.kolscan.io/profiles/GfXQesPe3Zuwg8JhAt6Cg8euJDTVx751enp9EQQmhzPH.png", x: "https://x.com/Spuno", handle: "@Spuno", hue: 112 },
  { id: "sadnbe", name: "Ethan Prosper", ticker: "ETHA", wallet: "sAdNbe1cKNMDqDsa4npB3TfL62T14uAo2MsUQfLvzLT", image: "https://cdn.kolscan.io/profiles/sAdNbe1cKNMDqDsa4npB3TfL62T14uAo2MsUQfLvzLT.png", x: "https://x.com/EthanProsper", handle: "@EthanProsper", hue: 358 },
  { id: "5hagyc", name: "Schoen", ticker: "SCHO", wallet: "5hAgYC8TJCcEZV7LTXAzkTrm7YL29YXyQQJPCNrG84zM", image: "https://cdn.kolscan.io/profiles/5hAgYC8TJCcEZV7LTXAzkTrm7YL29YXyQQJPCNrG84zM.png", x: "https://x.com/Schoen", handle: "@Schoen", hue: 93 },
  { id: "2fg5qd", name: "Cupsey", ticker: "CUPS", wallet: "2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f", image: "https://cdn.kolscan.io/profiles/2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f.png", x: "https://x.com/Cupsey", handle: "@Cupsey", hue: 218 },
  { id: "ztrg1p", name: "ItsVine", ticker: "ITSV", wallet: "ztRg1PdZbBQzMGbaz5UXqzaKX4frC82USoWiaVfohSv", image: "https://cdn.kolscan.io/profiles/ztRg1PdZbBQzMGbaz5UXqzaKX4frC82USoWiaVfohSv.png", x: "https://x.com/ItsVine", handle: "@ItsVine", hue: 313 },
  { id: "3h65mm", name: "Jidn", ticker: "JIDN", wallet: "3h65MmPZksoKKyEpEjnWU2Yk2iYT5oZDNitGy5cTaxoE", image: "https://cdn.kolscan.io/profiles/3h65MmPZksoKKyEpEjnWU2Yk2iYT5oZDNitGy5cTaxoE.png", x: "https://x.com/Jidn", handle: "@Jidn", hue: 325 },
  { id: "5s9qzj", name: "Thesis \u270d\ufe0f", ticker: "THES", wallet: "5S9qzJhSooakBaA9qZT6vWtoSy8FvyfxJ4t1vXvEK9G7", image: "https://cdn.kolscan.io/profiles/5S9qzJhSooakBaA9qZT6vWtoSy8FvyfxJ4t1vXvEK9G7.png", x: "https://x.com/Thesis✍️", handle: "@Thesis✍️", hue: 170 },
  { id: "ceua7z", name: "Tom", ticker: "TOM", wallet: "CEUA7zVoDRqRYoeHTP58UHU6TR8yvtVbeLrX1dppqoXJ", image: "https://cdn.kolscan.io/profiles/CEUA7zVoDRqRYoeHTP58UHU6TR8yvtVbeLrX1dppqoXJ.png", x: "https://x.com/Tom", handle: "@Tom", hue: 188 },
  { id: "dyan4x", name: "The Doc", ticker: "THED", wallet: "DYAn4XpAkN5mhiXkRB7dGq4Jadnx6XYgu8L5b3WGhbrt", image: "https://cdn.kolscan.io/profiles/DYAn4XpAkN5mhiXkRB7dGq4Jadnx6XYgu8L5b3WGhbrt.png", x: "https://x.com/TheDoc", handle: "@TheDoc", hue: 343 },
  { id: "h1tler", name: "alex", ticker: "ALEX", wallet: "H1TLERBQyQzSd5gbvbWwP97GjeL9txzWoN5BK4UG7xYm", image: "https://cdn.kolscan.io/profiles/H1TLERBQyQzSd5gbvbWwP97GjeL9txzWoN5BK4UG7xYm.png", x: "https://x.com/alex", handle: "@alex", hue: 47 },
  { id: "71pcu3", name: "Ramset \u271f", ticker: "RAMS", wallet: "71PCu3E4JP5RDBoY6wJteqzxkKNXLyE1byg5BTAL9UtQ", image: "https://cdn.kolscan.io/profiles/71PCu3E4JP5RDBoY6wJteqzxkKNXLyE1byg5BTAL9UtQ.png", x: "https://x.com/Ramset✟", handle: "@Ramset✟", hue: 28 },
  { id: "b32qbb", name: "Kadenox", ticker: "KADE", wallet: "B32QbbdDAyhvUQzjcaM5j6ZVKwjCxAwGH5Xgvb9SJqnC", image: "https://cdn.kolscan.io/profiles/B32QbbdDAyhvUQzjcaM5j6ZVKwjCxAwGH5Xgvb9SJqnC.png", x: "https://x.com/Kadenox", handle: "@Kadenox", hue: 327 },
  { id: "j6tdxv", name: "Pain", ticker: "PAIN", wallet: "J6TDXvarvpBdPXTaTU8eJbtso1PUCYKGkVtMKUUY8iEa", image: "https://cdn.kolscan.io/profiles/J6TDXvarvpBdPXTaTU8eJbtso1PUCYKGkVtMKUUY8iEa.png", x: "https://x.com/Pain", handle: "@Pain", hue: 152 },
  { id: "2x4h5y", name: "Orange", ticker: "ORAN", wallet: "2X4H5Y9C4Fy6Pf3wpq8Q4gMvLcWvfrrwDv2bdR8AAwQv", image: "https://cdn.kolscan.io/profiles/2X4H5Y9C4Fy6Pf3wpq8Q4gMvLcWvfrrwDv2bdR8AAwQv.png", x: "https://x.com/Orange", handle: "@Orange", hue: 274 },
  { id: "dnsh1u", name: "Hash", ticker: "HASH", wallet: "DNsh1UfJdxmze6T6GV9QK5SoFm7HsM5TRNxVuwVgo8Zj", image: "https://cdn.kolscan.io/profiles/DNsh1UfJdxmze6T6GV9QK5SoFm7HsM5TRNxVuwVgo8Zj.png", x: "https://x.com/Hash", handle: "@Hash", hue: 61 },
  { id: "dtjybz", name: "Files", ticker: "FILE", wallet: "DtjYbZntc2mEm1UrZHNcKguak6h6QM4S5xobnwFgg92Y", image: "https://cdn.kolscan.io/profiles/DtjYbZntc2mEm1UrZHNcKguak6h6QM4S5xobnwFgg92Y.png", x: "https://x.com/Files", handle: "@Files", hue: 229 },
  { id: "astawu", name: "asta", ticker: "ASTA", wallet: "AstaWuJuQiAS3AfqmM3xZxrJhkkZNXtW4VyaGQfqV6JL", image: "https://cdn.kolscan.io/profiles/AstaWuJuQiAS3AfqmM3xZxrJhkkZNXtW4VyaGQfqV6JL.png", x: "https://x.com/asta", handle: "@asta", hue: 113 },
  { id: "4yo9cu", name: "Gfree", ticker: "GFRE", wallet: "4yo9CUuTBbds9NFhZd4MzPiZZkUvveXdTnAH8qMsE8ku", image: "https://cdn.kolscan.io/profiles/4yo9CUuTBbds9NFhZd4MzPiZZkUvveXdTnAH8qMsE8ku.png", x: "https://x.com/Gfree", handle: "@Gfree", hue: 298 },
  { id: "3bzajd", name: "Matt", ticker: "MATT", wallet: "3bzaJd5yZG73EVDz8xosQb7gfZm2LN5auFGh6wnP1n1f", image: "https://cdn.kolscan.io/profiles/3bzaJd5yZG73EVDz8xosQb7gfZm2LN5auFGh6wnP1n1f.png", x: "https://x.com/Matt", handle: "@Matt", hue: 9 },
  { id: "ardinr", name: "trunoest", ticker: "TRUN", wallet: "ardinRsN1mNYVeoJWTBsWeYeXvuR9UUDGMsCDKpb6AT", image: "https://cdn.kolscan.io/profiles/ardinRsN1mNYVeoJWTBsWeYeXvuR9UUDGMsCDKpb6AT.png", x: "https://x.com/trunoest", handle: "@trunoest", hue: 148 },
  { id: "ez2jp3", name: "Keano", ticker: "KEAN", wallet: "Ez2jp3rwXUbaTx7XwiHGaWVgTPFdzJoSg8TopqbxfaJN", image: "https://cdn.kolscan.io/profiles/Ez2jp3rwXUbaTx7XwiHGaWVgTPFdzJoSg8TopqbxfaJN.png", x: "https://x.com/Keano", handle: "@Keano", hue: 164 },
  { id: "drj6sn", name: "Iced", ticker: "ICED", wallet: "DrJ6SnDXkEsPeGdmSs93v5rwWumv5QMvAGSZjAyWSd5o", image: "https://cdn.kolscan.io/profiles/DrJ6SnDXkEsPeGdmSs93v5rwWumv5QMvAGSZjAyWSd5o.png", x: "https://x.com/Iced", handle: "@Iced", hue: 113 },
  { id: "7mhql9", name: "Kimba", ticker: "KIMB", wallet: "7mHqL9GzGnbsYLoHLDzB7FiHAZbND2CZCJYFvU9PU1d3", image: "https://cdn.kolscan.io/profiles/7mHqL9GzGnbsYLoHLDzB7FiHAZbND2CZCJYFvU9PU1d3.png", x: "https://x.com/Kimba", handle: "@Kimba", hue: 46 },
  { id: "g3gzwq", name: "Goyim", ticker: "GOYI", wallet: "G3gZWqrYkNmYFKYCyfRCNtGuxdyuE2wiYKkZpiZn4WSS", image: "https://cdn.kolscan.io/profiles/G3gZWqrYkNmYFKYCyfRCNtGuxdyuE2wiYKkZpiZn4WSS.png", x: "https://x.com/Goyim", handle: "@Goyim", hue: 340 },
  { id: "eqifgy", name: "ban", ticker: "BAN", wallet: "EqiFgyNw6kgrmYstWyrP8VjKhka7XEmKTZzHSmwpr1Zb", image: "https://cdn.kolscan.io/profiles/EqiFgyNw6kgrmYstWyrP8VjKhka7XEmKTZzHSmwpr1Zb.png", x: "https://x.com/ban", handle: "@ban", hue: 213 },
  { id: "5rup87", name: "Sanity", ticker: "SANI", wallet: "5ruP877fu8sBshx9inDeHsVLjnJtgVBTbjnbupeDHYHH", image: "https://cdn.kolscan.io/profiles/5ruP877fu8sBshx9inDeHsVLjnJtgVBTbjnbupeDHYHH.png", x: "https://x.com/Sanity", handle: "@Sanity", hue: 72 },
  { id: "agqjiv", name: "noob mini", ticker: "NOOB", wallet: "AGqjivJr1dSv73TVUvdtqAwogzmThzvYMVXjGWg2FYLm", image: "https://cdn.kolscan.io/profiles/AGqjivJr1dSv73TVUvdtqAwogzmThzvYMVXjGWg2FYLm.png", x: "https://x.com/noobmini", handle: "@noobmini", hue: 147 },
  { id: "5vg7he", name: "blixze \u2671", ticker: "BLIX", wallet: "5vg7he5HibvsAW86wfiuP6jw7VwKmUAnP6P93mVCdpJu", image: "https://cdn.kolscan.io/profiles/5vg7he5HibvsAW86wfiuP6jw7VwKmUAnP6P93mVCdpJu.png", x: "https://x.com/blixze♱", handle: "@blixze♱", hue: 107 },
  { id: "a8i6j8", name: "Mike", ticker: "MIKE", wallet: "A8i6J8B1DgVdQaoeyrCmc18473EzYocEtZGavHT4sXzw", image: "https://cdn.kolscan.io/profiles/A8i6J8B1DgVdQaoeyrCmc18473EzYocEtZGavHT4sXzw.png", x: "https://x.com/Mike", handle: "@Mike", hue: 289 },
  { id: "dymsqu", name: "unprofitable", ticker: "UNPR", wallet: "DYmsQudNqJyyDvq86XmzAvrU9T7xwfQEwh6gPQw9TPNF", image: "https://cdn.kolscan.io/profiles/DYmsQudNqJyyDvq86XmzAvrU9T7xwfQEwh6gPQw9TPNF.png", x: "https://x.com/unprofitable", handle: "@unprofitable", hue: 167 },
  { id: "ejtqrp", name: "Zef", ticker: "ZEF", wallet: "EjtQrPTbcMevStBkpnjsH23NfUCMhGHusTYsHuGVQZp2", image: "https://cdn.kolscan.io/profiles/EjtQrPTbcMevStBkpnjsH23NfUCMhGHusTYsHuGVQZp2.png", x: "https://x.com/Zef", handle: "@Zef", hue: 158 },
  { id: "2w14ah", name: "Veloce", ticker: "VELO", wallet: "2W14ahXD3XBfWJchQ4K5NLXmguWWcTTUTuHDhEzeuvP3", image: "https://cdn.kolscan.io/profiles/2W14ahXD3XBfWJchQ4K5NLXmguWWcTTUTuHDhEzeuvP3.png", x: "https://x.com/Veloce", handle: "@Veloce", hue: 189 },
  { id: "uxuume", name: "Pandora", ticker: "PAND", wallet: "UxuuMeyX2pZPHmGZ2w3Q8MysvExCAquMtvEfqp2etvm", image: "https://cdn.kolscan.io/profiles/UxuuMeyX2pZPHmGZ2w3Q8MysvExCAquMtvEfqp2etvm.png", x: "https://x.com/Pandora", handle: "@Pandora", hue: 320 },
  { id: "hysq1k", name: "Apex \u5c6e", ticker: "APEX", wallet: "HYSq1KBAvqWpEv1pCbV31muKM1za5A1WSHGdiVLUoNhb", image: "https://cdn.kolscan.io/profiles/HYSq1KBAvqWpEv1pCbV31muKM1za5A1WSHGdiVLUoNhb.png", x: "https://x.com/Apex屮", handle: "@Apex屮", hue: 143 },
  { id: "9jyqfi", name: "Nach", ticker: "NACH", wallet: "9jyqFiLnruggwNn4EQwBNFXwpbLM9hrA4hV59ytyAVVz", image: "https://cdn.kolscan.io/profiles/9jyqFiLnruggwNn4EQwBNFXwpbLM9hrA4hV59ytyAVVz.png", x: "https://x.com/Nach", handle: "@Nach", hue: 170 },
  { id: "215nhc", name: "OGAntD", ticker: "OGAN", wallet: "215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP", image: "https://cdn.kolscan.io/profiles/215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP.png", x: "https://x.com/OGAntD", handle: "@OGAntD", hue: 196 },
  { id: "bqvz7f", name: "Limfork.eth", ticker: "LIMF", wallet: "BQVz7fQ1WsQmSTMY3umdPEPPTm1sdcBcX9sP7o6kPRmB", image: "https://cdn.kolscan.io/profiles/BQVz7fQ1WsQmSTMY3umdPEPPTm1sdcBcX9sP7o6kPRmB.png", x: "https://x.com/Limfork.eth", handle: "@Limfork.eth", hue: 294 },
  { id: "23ltop", name: "Snatcher", ticker: "SNAT", wallet: "23Ltopfensg1rSsCdoc1M8rcp5cB5bkqbmogMGmH63yW", image: "https://cdn.kolscan.io/profiles/23Ltopfensg1rSsCdoc1M8rcp5cB5bkqbmogMGmH63yW.png", x: "https://x.com/Snatcher", handle: "@Snatcher", hue: 289 },
  { id: "4tcmpx", name: "Yugi", ticker: "YUGI", wallet: "4TCMpxeevymUtCemwcVozhBLWq8Fikc1pVpfcW9zp66B", image: "https://cdn.kolscan.io/profiles/4TCMpxeevymUtCemwcVozhBLWq8Fikc1pVpfcW9zp66B.png", x: "https://x.com/Yugi", handle: "@Yugi", hue: 298 },
  { id: "dvbv5t", name: "CookDoc", ticker: "COOK", wallet: "Dvbv5TdAyPpJk16X9mUxWFVicYtCUxTLhuof8TGuUaRv", image: "https://cdn.kolscan.io/profiles/Dvbv5TdAyPpJk16X9mUxWFVicYtCUxTLhuof8TGuUaRv.png", x: "https://x.com/CookDoc", handle: "@CookDoc", hue: 31 },
  { id: "capn1y", name: "cap", ticker: "CAP", wallet: "CAPn1yH4oSywsxGU456jfgTrSSUidf9jgeAnHceNUJdw", image: "https://cdn.kolscan.io/profiles/CAPn1yH4oSywsxGU456jfgTrSSUidf9jgeAnHceNUJdw.png", x: "https://x.com/cap", handle: "@cap", hue: 235 },
  { id: "j9tyas", name: "Johnson", ticker: "JOHN", wallet: "J9TYAsWWidbrcZybmLSfrLzryANf4CgJBLdvwdGuC8MB", image: "https://cdn.kolscan.io/profiles/J9TYAsWWidbrcZybmLSfrLzryANf4CgJBLdvwdGuC8MB.png", x: "https://x.com/Johnson", handle: "@Johnson", hue: 231 },
  { id: "ipup3q", name: "Nikolas (aura arc)", ticker: "NIKO", wallet: "iPUp3qkm39ycMGbywWFMUyvaDhiiPGXeWXaDtmHNe6C", image: "https://cdn.kolscan.io/profiles/iPUp3qkm39ycMGbywWFMUyvaDhiiPGXeWXaDtmHNe6C.png", x: "https://x.com/Nikolas(auraarc)", handle: "@Nikolas(auraarc)", hue: 188 },
  { id: "eexvxk", name: "milito", ticker: "MILI", wallet: "EeXvxkcGqMDZeTaVeawzxm9mbzZwqDUMmfG3bF7uzumH", image: "https://cdn.kolscan.io/profiles/EeXvxkcGqMDZeTaVeawzxm9mbzZwqDUMmfG3bF7uzumH.png", x: "https://x.com/milito", handle: "@milito", hue: 47 },
  { id: "6kr7so", name: "KOREAN", ticker: "KORE", wallet: "6KR7SorsUQtNH6CB6JpAnWCAKeTysa95iyXeWihdNeGT", image: "https://cdn.kolscan.io/profiles/6KR7SorsUQtNH6CB6JpAnWCAKeTysa95iyXeWihdNeGT.png", x: "https://x.com/KOREAN", handle: "@KOREAN", hue: 123 },
  { id: "dnfuf1", name: "Gake", ticker: "GAKE", wallet: "DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm", image: "https://cdn.kolscan.io/profiles/DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm.png", x: "https://x.com/Gake", handle: "@Gake", hue: 312 },
  { id: "dedew3", name: "King Solomon", ticker: "KING", wallet: "DEdEW3SMPU2dCfXEcgj2YppmX9H3bnMDJaU4ctn2BQDQ", image: "https://cdn.kolscan.io/profiles/DEdEW3SMPU2dCfXEcgj2YppmX9H3bnMDJaU4ctn2BQDQ.png", x: "https://x.com/KingSolomon", handle: "@KingSolomon", hue: 197 },
  { id: "89hbgw", name: "AlxCooks", ticker: "ALXC", wallet: "89HbgWduLwoxcofWpmn1EiF9wEdpgkNDEyPjzZ72mkDi", image: "https://cdn.kolscan.io/profiles/89HbgWduLwoxcofWpmn1EiF9wEdpgkNDEyPjzZ72mkDi.png", x: "https://x.com/AlxCooks", handle: "@AlxCooks", hue: 197 },
  { id: "hahaa2", name: "Aspect", ticker: "ASPE", wallet: "hahaA2GjzZbwgAwwryjmTb8VkmLt68hdZVHhtcpknpT", image: "https://cdn.kolscan.io/profiles/hahaA2GjzZbwgAwwryjmTb8VkmLt68hdZVHhtcpknpT.png", x: "https://x.com/Aspect", handle: "@Aspect", hue: 177 },
  { id: "9thzox", name: "Dedmeow5", ticker: "DEDM", wallet: "9THzoX5yGNSgPBAjCF4Lgqc1wLXoFkMQit4XWbhhRnqE", image: "https://cdn.kolscan.io/profiles/9THzoX5yGNSgPBAjCF4Lgqc1wLXoFkMQit4XWbhhRnqE.png", x: "https://x.com/Dedmeow5", handle: "@Dedmeow5", hue: 301 },
  { id: "4ddrfi", name: "Mr. Frog", ticker: "MRFR", wallet: "4DdrfiDHpmx55i4SPssxVzS9ZaKLb8qr45NKY9Er9nNh", image: "https://cdn.kolscan.io/profiles/4DdrfiDHpmx55i4SPssxVzS9ZaKLb8qr45NKY9Er9nNh.png", x: "https://x.com/Mr.Frog", handle: "@Mr.Frog", hue: 114 },
  { id: "g6fuxj", name: "clukz", ticker: "CLUK", wallet: "G6fUXjMKPJzCY1rveAE6Qm7wy5U3vZgKDJmN1VPAdiZC", image: "https://cdn.kolscan.io/profiles/G6fUXjMKPJzCY1rveAE6Qm7wy5U3vZgKDJmN1VPAdiZC.png", x: "https://x.com/clukz", handle: "@clukz", hue: 132 },
  { id: "8oqomh", name: "big bags bobby", ticker: "BIGB", wallet: "8oQoMhfBQnRspn7QtNAq2aPThRE4q94kLSTwaaFQvRgs", image: "https://cdn.kolscan.io/profiles/8oQoMhfBQnRspn7QtNAq2aPThRE4q94kLSTwaaFQvRgs.png", x: "https://x.com/bigbagsbobby", handle: "@bigbagsbobby", hue: 81 },
];

const FLAT = Array.from({ length: 90 }, () => 0);

export const KOLS: Kol[] = SEEDS.map((s) => ({
  id: s.id,
  handle: s.handle,
  name: s.name,
  ticker: s.ticker,
  wallet: s.wallet,
  image: s.image,
  x: s.x,
  avatar: `linear-gradient(135deg, oklch(0.72 0.19 ${s.hue}), oklch(0.42 0.13 ${(s.hue + 60) % 360}))`,
  price: 0,
  change24h: 0,
  marketCap: 0,
  volume24h: 0,
  holders: 0,
  winRate: 0,
  pnl30d: 0,
  trades30d: 0,
  avgHold: "n/a",
  chain: "Solana",
  bio: `On-chain Solana trader tracked from wallet ${s.wallet.slice(0, 4)}...${s.wallet.slice(-4)}. Listing opens at $0.00 and reprices at each daily close from realised on-chain performance.`,
  series: FLAT,
}));

export function getKol(id: string) {
  return KOLS.find((k) => k.id === id);
}

export function shortWallet(w: string) {
  return `${w.slice(0, 4)}...${w.slice(-4)}`;
}

export function perfScore(k: Kol) {
  return Math.round(k.winRate * 6 + k.change24h * 3 + (k.pnl30d / 1_000_000) * 42 + k.trades30d / 40);
}

export const fmtUsd = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmtCompact(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

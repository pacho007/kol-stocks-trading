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

/**
 * Traders tracked on Robinhood Chain and traded on our own contracts there
 * (evm/src/SharpsMarket.sol). Every listing opens at the same price; all
 * divergence is earned by on-chain performance.
 *
 * Identity (name / avatar / X handle) comes from GMGN's wallet profiles.
 * 106 of 108 have all three; two wallets are genuinely untagged there and
 * keep a truncated-address label with empty image/x/handle — deliberately
 * left blank rather than guessed, since attributing the wrong X account to a
 * real trader is worse than showing none.
 *
 * `ticker` is unique per listing even when two wallets belong to the same
 * person (some traders run more than one tracked wallet) — duplicates get a
 * numeric suffix, because two listings both showing "$TECH" is unreadable on
 * a trading screen.
 *
 * NOTE: avatars are hotlinked from gmgn.ai. They render fine, but it's
 * third-party hosting that can rotate URLs or start blocking referrers —
 * mirroring them into our own storage would be more durable. AvatarMark
 * falls back to the ticker letters if an image fails to load.
 */
const SEEDS: Seed[] = [
  { id: "fe277a", name: "Vali", ticker: "VALI", wallet: "0xfe277aa25a4f65a182c0ec135854794eb7131e79", image: "https://gmgn.ai/defi/images/twitter/ff544b9d68dcd726525f43aebddcd9d7.jpg", x: "https://x.com/vali_eth", handle: "@vali_eth", hue: 322 },
  { id: "434616", name: "BBA", ticker: "BBA", wallet: "0x4346169036c8d32c422df027e5f46e55b489d2ee", image: "https://gmgn.ai/defi/images/twitter/2de7ff3d68882d4bb631ac0ddc48936c.jpg", x: "https://x.com/ape6743", handle: "@ape6743", hue: 168 },
  { id: "3310fd", name: "rciv", ticker: "RCIV", wallet: "0x3310fd13c6c55f054cc128439e1e51cd0cb16fed", image: "https://gmgn.ai/defi/images/twitter/0e007b80b6e0aae2233383c1cbcad09d.jpg", x: "https://x.com/rcivNFT", handle: "@rcivNFT", hue: 339 },
  { id: "d4229d", name: "OTTA 💰", ticker: "OTTA", wallet: "0xd4229d8166dbaa45689589d59fa968abc840b20f", image: "https://gmgn.ai/defi/images/twitter/9f5d8feaab0dd12be4df948e286bd127.jpg", x: "https://x.com/ottabag", handle: "@ottabag", hue: 217 },
  { id: "1788c1", name: "话梅糖", ticker: "1788", wallet: "0x1788c1a16f0d4bd404e2d44f90e3d39c9b9a7916", image: "https://gmgn.ai/defi/images/twitter/118fd2f9813bb4c698042b769ae274bb.jpg", x: "https://x.com/qwq0053", handle: "@qwq0053", hue: 153 },
  { id: "7a2363", name: "金狗挖掘机 | 0xDavid", ticker: "XDAV", wallet: "0x7a2363a401b2340c7941dd2eeff0196a5078d2e6", image: "https://gmgn.ai/defi/images/twitter/6fcc03fca6f28242bcb9e8ebcb6bb642.jpg", x: "https://x.com/HunterOnlyETH", handle: "@HunterOnlyETH", hue: 180 },
  { id: "bf530f", name: "TANG（恩师D滴峰挖财奶）", ticker: "TANG", wallet: "0xbf530f1bfb23bf332d1f1e41be026a5895fcced4", image: "https://gmgn.ai/defi/images/twitter/9cc300eda0d79ce30026d191c11a57b4.jpg", x: "https://x.com/i0ybz0", handle: "@i0ybz0", hue: 211 },
  { id: "9a44d4", name: "0x9a44…17c0", ticker: "9A44", wallet: "0x9a44d4974cad27175458ee071c189c2619f417c0", image: "", x: "", handle: "", hue: 135 },
  { id: "4b1070", name: "Giann", ticker: "GIAN", wallet: "0x4b10707123c79f6e99be486dcd95d60323988d76", image: "https://gmgn.ai/defi/images/twitter/262fcac08433a9e74e16c7fb90b7ede6.jpg", x: "https://x.com/Giann2K", handle: "@Giann2K", hue: 1 },
  { id: "9c0f22", name: "LYXR", ticker: "LYXR", wallet: "0x9c0f221c134591f7c9d565548ea4417900302ea3", image: "https://gmgn.ai/defi/images/twitter/301cbf6c4d8d5ccba9bbeea8e71fe71d.jpg", x: "https://x.com/lyxreth", handle: "@lyxreth", hue: 308 },
  { id: "a9f7d9", name: "SKX", ticker: "SKX", wallet: "0xa9f7d92a72428c55f093f6051c43db29f38bf34b", image: "https://gmgn.ai/defi/images/twitter/4ae6a70ad217266a96650dd3ccee0153.jpg", x: "https://x.com/SKXonSol", handle: "@SKXonSol", hue: 90 },
  { id: "c70ad5", name: "CryptoCharming 🐟", ticker: "CRYP", wallet: "0xc70ad5249bc432c7c69d71b017436441e9d6e37a", image: "https://gmgn.ai/defi/images/twitter/589ca2b2e2f5ec30e08d357fc7a90cec.jpg", x: "https://x.com/CryptoCharming", handle: "@CryptoCharming", hue: 68 },
  { id: "42910a", name: "J777Crypto", ticker: "JCRY", wallet: "0x42910a69effb47b8f8f2cb726fd964a654914131", image: "https://gmgn.ai/defi/images/twitter/520f9ba5ed435bd99bc4088a37460999.jpg", x: "https://x.com/J777Crypto", handle: "@J777Crypto", hue: 281 },
  { id: "e5e9ff", name: "fhn.gt (🌍,💻)", ticker: "FHNG", wallet: "0xe5e9ffe707ee071998340972af6fb178f5c64ba6", image: "https://gmgn.ai/defi/images/twitter/36ac11f5d6c5312fc583d249facadebb.jpg", x: "https://x.com/fhn_gt", handle: "@fhn_gt", hue: 303 },
  { id: "e6a5f1", name: "Matt Willemsen", ticker: "MATT", wallet: "0xe6a5f1690fcda05d9ba0a663b6e7ddf3c97eb7b1", image: "https://gmgn.ai/defi/images/twitter/eeba908218ff1af6775b168d401c65ec.jpg", x: "https://x.com/matt_willemsen", handle: "@matt_willemsen", hue: 321 },
  { id: "eeefff", name: "Shenron 🐉", ticker: "SHEN", wallet: "0xeeefff8ce2710fa490e0fcb794235e873c252d2e", image: "https://gmgn.ai/defi/images/twitter/8a6949256fbe3b36af284691ae10fa1c.jpg", x: "https://x.com/shenron__1", handle: "@shenron__1", hue: 92 },
  { id: "8e29d0", name: "Tux", ticker: "TUX", wallet: "0x8e29d0e2ca8e92a9f27192616e2e9f170fd2a035", image: "https://gmgn.ai/defi/images/twitter/b225f265fceb979ebb787f044c5cf051.jpg", x: "https://x.com/megastuffs", handle: "@megastuffs", hue: 2 },
  { id: "ca1a2f", name: "A", ticker: "CA1A", wallet: "0xca1a2fb7f3179d887504966b25d1606978adcd42", image: "https://gmgn.ai/defi/images/twitter/5fd491d5511741bd18df52f7498b2786.jpg", x: "https://x.com/Aomake70", handle: "@Aomake70", hue: 143 },
  { id: "0f84d2", name: "Cupsey", ticker: "CUPS", wallet: "0x0f84d2da979180394fbf9c4499febd0f602a6767", image: "https://gmgn.ai/defi/images/twitter/3ee6bfec21f0a814d95d8590491d1ea1.jpg", x: "https://x.com/CupseyV", handle: "@CupseyV", hue: 170 },
  { id: "d3358b", name: "Potato", ticker: "POTA", wallet: "0xd3358b1f39a6a71911c6e33717d185f99d43e80d", image: "https://gmgn.ai/defi/images/twitter/e26bd6eee764618ca4790eca4db0ee20.jpg", x: "https://x.com/rdbotato", handle: "@rdbotato", hue: 359 },
  { id: "6078ee", name: "Inq", ticker: "INQ", wallet: "0x6078ee8a93697c6d67863fcbff77141d9ab358b2", image: "https://gmgn.ai/defi/images/twitter/f72e80622c8f3ff4698baca3ca19ed52.jpg", x: "https://x.com/inquixit", handle: "@inquixit", hue: 82 },
  { id: "990797", name: "H.E. ZEPUMP", ticker: "HEZE", wallet: "0x99079745001f861ce5e0c1a27f8e4ebe55cac12c", image: "https://gmgn.ai/defi/images/twitter/35183cf2b5aa0a2d050bc92564402a84.jpg", x: "https://x.com/zepump", handle: "@zepump", hue: 245 },
  { id: "c2c6ac", name: "Ed_x區塊日記🇭🇰", ticker: "EDX", wallet: "0xc2c6acd377458010713e733e1b21dd6f670d091c", image: "https://gmgn.ai/defi/images/twitter/3f1c9209de89154751635d54bb96ed9e.jpg", x: "https://x.com/Ed_x0101", handle: "@Ed_x0101", hue: 355 },
  { id: "963133", name: "Sebastian Orellana", ticker: "SEBA", wallet: "0x9631335762e3603d2a7507d84838aa3236d52745", image: "https://gmgn.ai/defi/images/twitter/900d8b7a201386e0e14136b4ca4cb4ef.jpg", x: "https://x.com/Saint_pablo123", handle: "@Saint_pablo123", hue: 127 },
  { id: "e24da1", name: "rain & coffee", ticker: "RAIN", wallet: "0xe24da1c8f33e1dd8b7993b8b028c7109698ddaa5", image: "https://gmgn.ai/defi/images/twitter/763fd7293d97170ba1d93166de84bd4f.jpg", x: "https://x.com/0xRainandCoffee", handle: "@0xRainandCoffee", hue: 304 },
  { id: "c65236", name: "杀破狼 WolfyXBT", ticker: "WOLF", wallet: "0xc652368b05a27dd70d135f636536714e2806bd9a", image: "https://gmgn.ai/defi/images/twitter/baad75b7316083014e78dc8fce18774b.jpg", x: "https://x.com/wolfyxbt", handle: "@wolfyxbt", hue: 83 },
  { id: "e32106", name: "Tekkerrss", ticker: "TEKK", wallet: "0xe3210627730c8e14d6bf2117eab28de531650111", image: "https://gmgn.ai/defi/images/twitter/314ed4f8ab77f4cd154a44a056077a30.jpg", x: "https://x.com/Tekkerrss", handle: "@Tekkerrss", hue: 215 },
  { id: "5250db", name: "CoCo❕", ticker: "COCO", wallet: "0x5250dbcf6ac11c4c2cbd8dcaf5a6d019f3268ea8", image: "https://gmgn.ai/defi/images/twitter/7cd49c428d8143473d352894d7d1cb43.jpg", x: "https://x.com/CoCoCookerr", handle: "@CoCoCookerr", hue: 303 },
  { id: "a7dcc4", name: "H.E. ZEPUMP", ticker: "HEZ2", wallet: "0xa7dcc417c63f24f9073b667a5d7149bd38463d0f", image: "https://gmgn.ai/defi/images/twitter/35183cf2b5aa0a2d050bc92564402a84.jpg", x: "https://x.com/zepump", handle: "@zepump", hue: 111 },
  { id: "5c14c5", name: "Hasan I 哈桑 🇺🇸🇨🇳", ticker: "HASA", wallet: "0x5c14c517991c2bd72c3495efed8c9aefdbd8b8e1", image: "https://gmgn.ai/defi/images/twitter/2ffa4043d0b97152cd21596f3858e070.jpg", x: "https://x.com/paralog1", handle: "@paralog1", hue: 287 },
  { id: "f591db", name: "pk", ticker: "PK", wallet: "0xf591db9dccd5d3aaf8508da2cffedd5ef5bb920f", image: "https://gmgn.ai/defi/images/twitter/ebca26c9c137107dcb57ed61fad0a99b.jpg", x: "https://x.com/pk79z", handle: "@pk79z", hue: 61 },
  { id: "7b3d8e", name: "casino", ticker: "CASI", wallet: "0x7b3d8e939ee08b52d06ab5e6f85791a6007e8d61", image: "https://gmgn.ai/defi/images/twitter/77140051103687a949a9c36de6059c92.jpg", x: "https://x.com/casino847", handle: "@casino847", hue: 203 },
  { id: "9224bb", name: "DeScientist", ticker: "DESC", wallet: "0x9224bbb4e0fbe2f2f8fab55debc41eb21fdfb804", image: "https://gmgn.ai/defi/images/twitter/48c52672bd4fc2d998cabfc9310e0202.jpg", x: "https://x.com/GuruG_crypto", handle: "@GuruG_crypto", hue: 84 },
  { id: "f0f8a6", name: "木木", ticker: "F0F8", wallet: "0xf0f8a6479a428edd0eab965e624800585b62972c", image: "https://gmgn.ai/defi/images/twitter/59e6b29c539442be508263462eb1648a.jpg", x: "https://x.com/0xmmu", handle: "@0xmmu", hue: 335 },
  { id: "b226f9", name: "AlexWong 🇭🇰 | 1000X GEM", ticker: "ALEX", wallet: "0xb226f97bc5b01978848dc440b40c70faea7c006e", image: "https://gmgn.ai/defi/images/twitter/f4b4598e8f77ee160f99346a9821a390.jpg", x: "https://x.com/sadd_asd77675", handle: "@sadd_asd77675", hue: 123 },
  { id: "a1426c", name: "不知名打狗大师🧢", ticker: "A142", wallet: "0xa1426c6f65fe804e05ce3c07a42412d735ef78bc", image: "https://gmgn.ai/defi/images/twitter/856c9c41015e51475e7f7aa379a0de4f.jpg", x: "https://x.com/0xrap9", handle: "@0xrap9", hue: 311 },
  { id: "2fcc02", name: "τop τick crypτo 📁 🤖🧠", ticker: "OPIC", wallet: "0x2fcc020f72e5d2edd2a24d04f3dc90d7fdfbd1dd", image: "https://gmgn.ai/defi/images/twitter/dadc7c4113c403d4b1b4881219d2a05a.jpg", x: "https://x.com/toptickcrypto", handle: "@toptickcrypto", hue: 103 },
  { id: "61fd0d", name: "0xᴜᴇzhᴀng|985.eth", ticker: "XZHN", wallet: "0x61fd0d043d519f5a2bd05785000f30db96809429", image: "https://gmgn.ai/defi/images/twitter/afca421efa4efefe5c72d856a6cb81a5.jpg", x: "https://x.com/Unipioneer", handle: "@Unipioneer", hue: 52 },
  { id: "a7d4ff", name: "MIRRO🔶 BNB", ticker: "MIRR", wallet: "0xa7d4ffc4eca3c71af150ce302560a9d04a1d2b9f", image: "https://gmgn.ai/defi/images/twitter/c75cbcf8907b4b9e6335902ee2b2817e.jpg", x: "https://x.com/Mirro7777", handle: "@Mirro7777", hue: 140 },
  { id: "28aa4f", name: "fierydev 💥", ticker: "FIER", wallet: "0x28aa4f9ffe21365473b64c161b566c3cdead0108", image: "https://gmgn.ai/defi/images/twitter/3527585ad94dfbd593ca60d68c85282e.jpg", x: "https://x.com/dev_enjoys", handle: "@dev_enjoys", hue: 103 },
  { id: "b90d9e", name: "从零开始的打狗生活（农场悟道）", ticker: "B90D", wallet: "0xb90d9ea599c2634069ae4d5eecc5ab7234a81a05", image: "https://gmgn.ai/defi/images/twitter/3151deba2dcb57353471974c0e903429.jpg", x: "https://x.com/cryptomoon520", handle: "@cryptomoon520", hue: 101 },
  { id: "55fade", name: "0X财神（版本之神）", ticker: "55FA", wallet: "0x55fade80e573c4594b0dd73041297024f1f2ee95", image: "https://gmgn.ai/defi/images/twitter/174671ff052c279b58cf01f3d81a497c.jpg", x: "https://x.com/0xcaishen_1", handle: "@0xcaishen_1", hue: 160 },
  { id: "a83b73", name: "AntPositions(蚂蚁仓）☄️", ticker: "ANTP", wallet: "0xa83b73f5644cde337b61da79589f10ea15548811", image: "https://gmgn.ai/defi/images/twitter/f5fa823cbf1e264246f12b7d6908c5b5.jpg", x: "https://x.com/antpositions", handle: "@antpositions", hue: 197 },
  { id: "023ab8", name: "0x023a…4d66", ticker: "023A", wallet: "0x023ab8e20a4682d315daef4c91db96bd77934d66", image: "", x: "", handle: "", hue: 290 },
  { id: "fea315", name: "游侠🔶Yoxia", ticker: "YOXI", wallet: "0xfea3157ff571174f05fc86af3caee3b870a8495a", image: "https://gmgn.ai/defi/images/twitter/d119907754ea3556ee90683cf44c785b.jpg", x: "https://x.com/Gmf_winner", handle: "@Gmf_winner", hue: 175 },
  { id: "bf004b", name: "阿峰_Afeng", ticker: "AFEN", wallet: "0xbf004bff64725914ee36d03b87d6965b0ced4903", image: "https://gmgn.ai/defi/images/twitter/5ec78f3037c4798a3514ef0ecf725b31.jpg", x: "https://x.com/aa_AFeng", handle: "@aa_AFeng", hue: 71 },
  { id: "c848a7", name: "Skid", ticker: "SKID", wallet: "0xc848a7530ed12eb545a01eaa906de55f9491fb59", image: "https://gmgn.ai/defi/images/twitter/35d74be1124d3b9f43bd286ee5c14d3f.jpg", x: "https://x.com/skid_eth", handle: "@skid_eth", hue: 267 },
  { id: "9a1ee6", name: "Erison", ticker: "ERIS", wallet: "0x9a1ee67e454bb963183884e7e2872fc0016613d3", image: "https://gmgn.ai/defi/images/twitter/cbb484cf8cb45c22070e35899fd9fe2b.jpg", x: "https://x.com/erisonmeira", handle: "@erisonmeira", hue: 150 },
  { id: "664d66", name: "Tavern", ticker: "TAVE", wallet: "0x664d6645a04be9e27a8b33088f85025f29d45dc1", image: "https://gmgn.ai/defi/images/twitter/8cdfd7e098a47d24796c20dba601d0a9.jpg", x: "https://x.com/TurtleTavernTV", handle: "@TurtleTavernTV", hue: 245 },
  { id: "609f2c", name: "whashywash", ticker: "WHAS", wallet: "0x609f2c912175f8cd4438c1882f291fa6a4b4c735", image: "https://gmgn.ai/defi/images/twitter/69641f382fcddcab19f20fd8f9e754c2.jpg", x: "https://x.com/whashywash", handle: "@whashywash", hue: 9 },
  { id: "e33b74", name: "Nephew Sam", ticker: "NEPH", wallet: "0xe33b746a030c3b3c512d274b05ea6e40772cf212", image: "https://gmgn.ai/defi/images/twitter/74a5c7090661ceff55a6322cca5eb83f.jpg", x: "https://x.com/Nephew_Sam_", handle: "@Nephew_Sam_", hue: 58 },
  { id: "5ab2d1", name: "Bright Avian | True Pengu King & Hand of Neo Tokyo", ticker: "BRIG", wallet: "0x5ab2d1f5069dd2f9aeec3b0a8e923b1cdbe7fc44", image: "https://gmgn.ai/defi/images/twitter/72c6bf4a6c82a2efe6db6cc7644e48f6.jpg", x: "https://x.com/BrightAvian", handle: "@BrightAvian", hue: 77 },
  { id: "2f32c7", name: "Rahim Mahtab", ticker: "RAHI", wallet: "0x2f32c70ecdbb198fc1b13db1db3375c3392cc063", image: "https://gmgn.ai/defi/images/twitter/cc056b87c17e4524cfe6a663b4efd2da.jpg", x: "https://x.com/Rahim_mahtab", handle: "@Rahim_mahtab", hue: 190 },
  { id: "f38ce5", name: "professor", ticker: "PROF", wallet: "0xf38ce55fe4e517e77e1056a54e64f22d43d88c3a", image: "https://gmgn.ai/defi/images/twitter/9bf11518b3ebcd7b9d39518a30f46031.jpg", x: "https://x.com/0xossalivan", handle: "@0xossalivan", hue: 47 },
  { id: "e475cd", name: "Degenerate Brian", ticker: "DEGE", wallet: "0xe475cd3f0d0a77ec581bb6540abef60b0f3f0d57", image: "https://gmgn.ai/defi/images/twitter/19a300757f264deb76b7146ef26dbcb2.jpg", x: "https://x.com/Brian_Degens", handle: "@Brian_Degens", hue: 103 },
  { id: "93585d", name: "加密帅", ticker: "9358", wallet: "0x93585d7f5f15d8bc67f41a12d2b3e3966a1ee6a0", image: "https://gmgn.ai/defi/images/twitter/5ecb41de46201c88afdf97cdacc47254.jpg", x: "https://x.com/xlxl114", handle: "@xlxl114", hue: 335 },
  { id: "a4beae", name: "api5", ticker: "API", wallet: "0xa4beaea04ee42f451f38c771842489d7649b95f2", image: "https://gmgn.ai/defi/images/twitter/9c24a4848a684d3227680e36ae6bd999.jpg", x: "https://x.com/apastala5", handle: "@apastala5", hue: 208 },
  { id: "758e83", name: "Cryptk33p3r ❤️ Memecoin", ticker: "CRY2", wallet: "0x758e83c114e36a28ca1f31c4d2adb5ec7c04c578", image: "https://gmgn.ai/defi/images/twitter/a305340ad7bc31855ea656b75cc637ec.jpg", x: "https://x.com/Kryptk33p3r666", handle: "@Kryptk33p3r666", hue: 73 },
  { id: "904a5d", name: "bandit", ticker: "BAND", wallet: "0x904a5d05d72a0575c6a60f7de7566abc2ac331e2", image: "https://gmgn.ai/defi/images/twitter/e03a8284c5d10e9d69e010fd9776dc54.jpg", x: "https://x.com/bandeeeez", handle: "@bandeeeez", hue: 301 },
  { id: "8d7bbf", name: "Oxxyy", ticker: "OXXY", wallet: "0x8d7bbfa0506ea95c73d864310818acc3e5fa05d9", image: "https://gmgn.ai/defi/images/twitter/82f1d7429302b5f506831dcb2334f7b8.jpg", x: "https://x.com/Oxxyy13", handle: "@Oxxyy13", hue: 0 },
  { id: "41ccc2", name: "ROCKSTAR", ticker: "ROCK", wallet: "0x41ccc209d3ba4e81ef0c1fcb6d191127fb5b42f5", image: "https://gmgn.ai/defi/images/twitter/134043ec991917b8f321e8ab74f64182.jpg", x: "https://x.com/rawrstarxdd", handle: "@rawrstarxdd", hue: 217 },
  { id: "dd6f33", name: "Stigman", ticker: "STIG", wallet: "0xdd6f338b91f40e5a02c468b7cb49cccc569a3134", image: "https://gmgn.ai/defi/images/twitter/1ad0ff4086f30be09f10a626b4313b96.jpg", x: "https://x.com/Stigman__", handle: "@Stigman__", hue: 27 },
  { id: "07591d", name: "driz", ticker: "DRIZ", wallet: "0x07591d902e68503c113ac4beca8abb3e3f6b0ab3", image: "https://gmgn.ai/defi/images/twitter/53ea2cf2157274b3b9359e86456e5da5.jpg", x: "https://x.com/driz1x_", handle: "@driz1x_", hue: 224 },
  { id: "62e533", name: "leet", ticker: "LEET", wallet: "0x62e5332dcb286f1753d245707c91a38821bb5645", image: "https://gmgn.ai/defi/images/twitter/5fd8a3abafcad7b2ece86a79964c7e80.jpg", x: "https://x.com/0xleet", handle: "@0xleet", hue: 213 },
  { id: "2ce9d4", name: "枯坐p小将", ticker: "2CE9", wallet: "0x2ce9d43d1cba6ae31d7f07bfe0098dfa2d833373", image: "https://gmgn.ai/defi/images/twitter/55c0d682e49a2377807e9a864fe6c03e.jpg", x: "https://x.com/rob02643673_rob", handle: "@rob02643673_rob", hue: 325 },
  { id: "07cdaf", name: "ozark", ticker: "OZAR", wallet: "0x07cdaf0140c60a0c34681065abf49bb8d85b8cbe", image: "https://gmgn.ai/defi/images/twitter/744e4a2cd48650713d97584dd9311828.jpg", x: "https://x.com/ohzarke", handle: "@ohzarke", hue: 73 },
  { id: "d41fea", name: "milito", ticker: "MILI", wallet: "0xd41feaa24dede516a501862cf1f376defb811772", image: "https://gmgn.ai/defi/images/twitter/5192cfecab0a136e01e747b8c009d80b.jpg", x: "https://x.com/fnmilito", handle: "@fnmilito", hue: 114 },
  { id: "da9f48", name: "扑街仔🔶 BNB🎒", ticker: "BNB", wallet: "0xda9f482ea717384af879597303e8b67968afcde2", image: "https://gmgn.ai/defi/images/twitter/3460ec001467f046b817b5ffd8e33750.jpg", x: "https://x.com/_pogai_", handle: "@_pogai_", hue: 270 },
  { id: "54be3a", name: "dingaling", ticker: "DING", wallet: "0x54be3a794282c030b15e43ae2bb182e14c409c5e", image: "https://gmgn.ai/defi/images/twitter/0cd1d65c19ddcff67dd0c08de7fa2024.jpg", x: "https://x.com/dingalingts", handle: "@dingalingts", hue: 273 },
  { id: "061825", name: "Tekkerrss", ticker: "TEK2", wallet: "0x061825a9195a2fb526735032fcac4ef58c6e52e4", image: "https://gmgn.ai/defi/images/twitter/314ed4f8ab77f4cd154a44a056077a30.jpg", x: "https://x.com/Tekkerrss", handle: "@Tekkerrss", hue: 41 },
  { id: "4d68d0", name: "Jud", ticker: "JUD", wallet: "0x4d68d0ebc52ce41f2ed057f926960df89b0455f9", image: "https://gmgn.ai/defi/images/twitter/ad225a34d1e01f353f1ffd969b1db971.jpg", x: "https://x.com/judthedev", handle: "@judthedev", hue: 99 },
  { id: "1df316", name: "alkuuu | AP", ticker: "ALKU", wallet: "0x1df3160f73fd6c1bec394c51fc20b7b2a91d6330", image: "https://gmgn.ai/defi/images/twitter/a67a54eca25124e134fab9a56e9105d1.jpg", x: "https://x.com/alkuap", handle: "@alkuap", hue: 159 },
  { id: "4a3049", name: "Phero.hl", ticker: "PHER", wallet: "0x4a30496554ef401e4b687189f7df6efe4b3e0249", image: "https://gmgn.ai/defi/images/twitter/b600c66e0d55ed59825f9b4e136b278e.jpg", x: "https://x.com/pheromones_sol", handle: "@pheromones_sol", hue: 101 },
  { id: "077b99", name: "clukz", ticker: "CLUK", wallet: "0x077b9981bc8a2ca417cea41861111da63266988b", image: "https://gmgn.ai/defi/images/twitter/149d1310b93e45b74a5221e786f4a36e.jpg", x: "https://x.com/clukz", handle: "@clukz", hue: 97 },
  { id: "38e420", name: "Loopierr", ticker: "LOOP", wallet: "0x38e4203f12b1e74d87deb0083d3c8b51ad9a104e", image: "https://gmgn.ai/defi/images/twitter/85c16e16aa34b54d2d5c0406c2ae2ca6.jpg", x: "https://x.com/Loopierr", handle: "@Loopierr", hue: 79 },
  { id: "9897b4", name: "K线漂移", ticker: "9897", wallet: "0x9897b49174dc565730ef1d116d80081574ccb3ec", image: "https://gmgn.ai/defi/images/twitter/72c6d05da2610e39f08c2cc39bd89b89.jpg", x: "https://x.com/Gs97z", handle: "@Gs97z", hue: 193 },
  { id: "3391a3", name: "Rell", ticker: "RELL", wallet: "0x3391a39a1b508e54a361924a26056c01c1c2c07d", image: "https://gmgn.ai/defi/images/twitter/e1644f1e7fab5bc551ab8f94530a3af9.jpg", x: "https://x.com/Reljoooo", handle: "@Reljoooo", hue: 18 },
  { id: "e28601", name: "NΞO", ticker: "NO", wallet: "0xe28601398a5448d1147e6e8b0e0c6d686f0d216d", image: "https://gmgn.ai/defi/images/twitter/0a916e3e04a7a8184d2e32c116fe5e83.jpg", x: "https://x.com/NeoCallss", handle: "@NeoCallss", hue: 73 },
  { id: "5fa57f", name: "Veloce", ticker: "VELO", wallet: "0x5fa57fcaf86e137cb8185c4cb2c01ea7b5b14cfb", image: "https://gmgn.ai/defi/images/twitter/8c03e4586717d7560460bd51b1f3f3fa.jpg", x: "https://x.com/VeloceSVJ", handle: "@VeloceSVJ", hue: 34 },
  { id: "2190d4", name: "0xleonidas", ticker: "XLEO", wallet: "0x2190d4ee2bfc8883c3d71f4b5f41acd7a7287ff5", image: "https://gmgn.ai/defi/images/twitter/2d3d34fea182a0323979d1d7c910e3b2.jpg", x: "https://x.com/0xleonidas__", handle: "@0xleonidas__", hue: 102 },
  { id: "c4df5f", name: "SUN (❖,❖)🍡.edge🦭", ticker: "SUNE", wallet: "0xc4df5f2125151bff3a6aa7328529eae1b9d3cc31", image: "https://gmgn.ai/defi/images/twitter/480229973e85922496e54c05dc6c2c25.jpg", x: "https://x.com/dsjwin", handle: "@dsjwin", hue: 217 },
  { id: "92c371", name: "CryptoLucky", ticker: "CRY3", wallet: "0x92c371744e71dbe58c603661ba8784fd76472e1b", image: "https://gmgn.ai/defi/images/twitter/2298bee6af02aeaf1675bf8bf4a57221.jpg", x: "https://x.com/sol_lucky_", handle: "@sol_lucky_", hue: 180 },
  { id: "0cd4d1", name: "Inside Calls", ticker: "INSI", wallet: "0x0cd4d1a9c67a0c7677dcacb37791dadb38ea5666", image: "https://gmgn.ai/defi/images/twitter/54c2a3bc85fb6f596321eb312470303d.jpg", x: "https://x.com/insidecalls", handle: "@insidecalls", hue: 17 },
  { id: "f100af", name: "Tom", ticker: "TOM", wallet: "0xf100af33f90445d1d482fb63df3f6cdb475eeb0f", image: "https://gmgn.ai/defi/images/twitter/09039121257c385e119b659b556c837e.jpg", x: "https://x.com/tdmilky", handle: "@tdmilky", hue: 227 },
  { id: "037e6b", name: "Spanny", ticker: "SPAN", wallet: "0x037e6b68ca866598d464a370afa060e4583aa0b8", image: "https://gmgn.ai/defi/images/twitter/fdfcbecf9e663ad2788b1b9b3549c219.jpg", x: "https://x.com/0xSpanny", handle: "@0xSpanny", hue: 40 },
  { id: "94cf7e", name: "888UP", ticker: "UP", wallet: "0x94cf7ed19901eb7d487c779e6d1baa87157b2d01", image: "https://gmgn.ai/defi/images/twitter/fa795cce7d1b9d3418488b21ea515861.jpg", x: "https://x.com/888upupup", handle: "@888upupup", hue: 105 },
  { id: "a866c5", name: "William", ticker: "WILL", wallet: "0xa866c5adddc1c3570b6328491b510deefa374e0d", image: "https://gmgn.ai/defi/images/twitter/3b3dab94d5d7b98603231e2de9961bb8.jpg", x: "https://x.com/Vera548926", handle: "@Vera548926", hue: 205 },
  { id: "371903", name: "Yoda", ticker: "YODA", wallet: "0x371903abb32f5f69b536b77495e92adedfea25da", image: "https://gmgn.ai/defi/images/twitter/8d6fe579ab3668b6c7e0b67999707d14.jpg", x: "https://x.com/yodacalls", handle: "@yodacalls", hue: 179 },
  { id: "f78b06", name: "kurtz", ticker: "KURT", wallet: "0xf78b066050e00fdb9b980e265aa9f317ef4b947c", image: "https://gmgn.ai/defi/images/twitter/b7af6152aff016d4fc194480f1c8bdad.jpg", x: "https://x.com/kurtzxx", handle: "@kurtzxx", hue: 8 },
  { id: "069704", name: "summer 🔶 BNB ｜加密盛夏", ticker: "SUMM", wallet: "0x06970464c8b936cda744a454a33f2206dbbbfe49", image: "https://gmgn.ai/defi/images/twitter/5596db8f22eb01795c3c4798a15e93d1.jpg", x: "https://x.com/summerrainy888", handle: "@summerrainy888", hue: 36 },
  { id: "777c47", name: "Apex", ticker: "APEX", wallet: "0x777c47498b42dbe449fb4cb810871a46cd777777", image: "https://gmgn.ai/defi/images/twitter/f0e2a62b2e42c86e2b2838935a72c74b.jpg", x: "https://x.com/apex_ether", handle: "@apex_ether", hue: 57 },
  { id: "a3d3fe", name: "b", ticker: "A3D3", wallet: "0xa3d3fed954a332992cfec8c606eeb2a25fbb3864", image: "https://gmgn.ai/defi/images/twitter/57edecc15bea5d91e72352b469fa9b54.jpg", x: "https://x.com/bagufps", handle: "@bagufps", hue: 65 },
  { id: "57825f", name: "TIGER", ticker: "TIGE", wallet: "0x57825f68fc7b32eaaa1e90db1fd6cd997b5a4035", image: "https://gmgn.ai/defi/images/twitter/3711f6f76b8607cecdf57de9d63133b5.jpg", x: "https://x.com/tiger_web3", handle: "@tiger_web3", hue: 176 },
  { id: "49b3e7", name: "Dod✞", ticker: "DOD", wallet: "0x49b3e70dfc8b18654f5335532c17406794ac5ddd", image: "https://gmgn.ai/defi/images/twitter/884629b6431e714caa2b27f11cd1b018.jpg", x: "https://x.com/Dodseven77", handle: "@Dodseven77", hue: 301 },
  { id: "1da7f7", name: "十八哥哥🔶BNB", ticker: "BNB2", wallet: "0x1da7f7b6069cdbfe53f96db760275836e43b66de", image: "https://gmgn.ai/defi/images/twitter/eb3984db69defc2e66c85382e610edd2.jpg", x: "https://x.com/shibaxiaogege", handle: "@shibaxiaogege", hue: 190 },
  { id: "683035", name: "tech", ticker: "TECH", wallet: "0x683035da6b84ce48421534c1d3d160a8487cb9bb", image: "https://gmgn.ai/defi/images/twitter/7d480c09dfec899597d1a84743f369a2.jpg", x: "https://x.com/technoviking46", handle: "@technoviking46", hue: 258 },
  { id: "785234", name: "Han", ticker: "HAN", wallet: "0x7852346c77b3a622fa73607ee35cc784e53f326b", image: "https://gmgn.ai/defi/images/twitter/01ae0846760066555cb78c13a7d818f1.jpg", x: "https://x.com/00xhwin", handle: "@00xhwin", hue: 92 },
  { id: "3d0631", name: "tech", ticker: "TEC2", wallet: "0x3d06315c94ac30b6061c91caf748fc2db04a89f4", image: "https://gmgn.ai/defi/images/twitter/7d480c09dfec899597d1a84743f369a2.jpg", x: "https://x.com/technoviking46", handle: "@technoviking46", hue: 148 },
  { id: "9db43b", name: "就叫19(角度大师版", ticker: "9DB4", wallet: "0x9db43bb875e10bad12cdf798b14f279e3775ddff", image: "https://gmgn.ai/defi/images/twitter/7c525f30095b2f3c5ea48b6055780697.jpg", x: "https://x.com/nineteen_888", handle: "@nineteen_888", hue: 280 },
  { id: "7103a4", name: "Simon Squibb", ticker: "SIMO", wallet: "0x7103a46bb31ce7b26972e4e63d1a83e857e7f7ef", image: "https://gmgn.ai/defi/images/twitter/6d57815afec7f3234b682015878992d9.jpg", x: "https://x.com/simonsquibb", handle: "@simonsquibb", hue: 267 },
  { id: "7551fd", name: "kreo", ticker: "KREO", wallet: "0x7551fd7a88afd941ddcc0a4f1cb62cf85afdae61", image: "https://gmgn.ai/defi/images/twitter/118cdeaf77b8d0225d7a07d3c8786669.jpg", x: "https://x.com/kreo444", handle: "@kreo444", hue: 18 },
  { id: "6e83c5", name: "Surpass", ticker: "SURP", wallet: "0x6e83c54544084b9f6c185456cc9a92b18f981434", image: "https://gmgn.ai/defi/images/twitter/16b4a2d3500d87d9de941d38c3adfecc.jpg", x: "https://x.com/surpassdd", handle: "@surpassdd", hue: 237 },
  { id: "59f2f5", name: "acid", ticker: "ACID", wallet: "0x59f2f58be6cf6c9b782373eb627d93ed7345fd90", image: "https://gmgn.ai/defi/images/twitter/7d2276199ef6212e01856f7b78f3f8fa.jpg", x: "https://x.com/acidweb3", handle: "@acidweb3", hue: 355 },
  { id: "3b7bd3", name: "Jinwoo", ticker: "JINW", wallet: "0x3b7bd3fc02e51786e437e813decfe128e468f808", image: "https://gmgn.ai/defi/images/twitter/0004d98b334a31cc5faae589963d6d08.jpg", x: "https://x.com/jinwoo_bnb", handle: "@jinwoo_bnb", hue: 180 },
  { id: "18e353", name: "Tripuji🏝️", ticker: "TRIP", wallet: "0x18e3533fe402569b877650f753e877474c171c9d", image: "https://gmgn.ai/defi/images/twitter/619171c4900609b70c7abb5d08af4c72.jpg", x: "https://x.com/Triipujik", handle: "@Triipujik", hue: 127 },
  { id: "59cb46", name: "Min", ticker: "MIN", wallet: "0x59cb462cd4adabe9734b1c7a8517a1b52d1c36d0", image: "https://gmgn.ai/defi/images/twitter/73c0a8e6885f79c814eab9958af1ada6.jpg", x: "https://x.com/mincabal", handle: "@mincabal", hue: 196 },
  { id: "d03353", name: "nyhrox", ticker: "NYHR", wallet: "0xd03353d8a531a7b05509f35fadef3e042188bdb5", image: "https://gmgn.ai/defi/images/twitter/1572637159beae55885faf41413ef1a6.jpg", x: "https://x.com/nyhrox", handle: "@nyhrox", hue: 168 },
  { id: "bd6b8d", name: "Cooker.hl | 版本之子 (Theo Arc)", ticker: "COOK", wallet: "0xbd6b8d8fa94f7307840252548549b56a33c98054", image: "https://gmgn.ai/defi/images/twitter/81b7fb0a5a0a7d84554485d67168e2cc.jpg", x: "https://x.com/CookerFlips", handle: "@CookerFlips", hue: 295 },
];

const FLAT = Array.from({ length: 90 }, () => 0);

export const KOLS: Kol[] = SEEDS.map((s) => ({
  id: s.id,
  // Empty when the trader has no linked social — deliberately NOT falling back
  // to a truncated wallet. The wallet is already rendered next to this (and,
  // for unnamed traders, is the display name too), so a fallback here printed
  // the same address three times in a row on the listing page.
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
  chain: "Robinhood Chain",
  bio: `On-chain trader tracked from wallet ${s.wallet.slice(0, 6)}...${s.wallet.slice(-4)}. Listing opens at $0.01; share price moves with the trader's live on-chain performance since launch.`,
  series: FLAT,
}));

export function getKol(id: string) {
  return KOLS.find((k) => k.id === id);
}

export function shortWallet(w: string) {
  return `${w.slice(0, 6)}...${w.slice(-4)}`;
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

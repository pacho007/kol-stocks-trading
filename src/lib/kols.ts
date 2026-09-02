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
 * Traders tracked from GMGN.ai (Ethereum mainnet wallet activity) and traded
 * on our own platform contracts on Robinhood Chain. All listings open at $0.00.
 * Nicknames come from GMGN's community tagging (null/untagged wallets fall
 * back to a truncated-address label) — no avatar image or linked X handle is
 * available from GMGN, so those fields are blank pending a real source.
 */
const SEEDS: Seed[] = [
  { id: "fe277a", name: "Vali", ticker: "VALI", wallet: "0xfe277aa25a4f65a182c0ec135854794eb7131e79", image: "", x: "", handle: "", hue: 322 },
  { id: "434616", name: "BBA", ticker: "BBA", wallet: "0x4346169036c8d32c422df027e5f46e55b489d2ee", image: "", x: "", handle: "", hue: 168 },
  { id: "3310fd", name: "rciv", ticker: "RCIV", wallet: "0x3310fd13c6c55f054cc128439e1e51cd0cb16fed", image: "", x: "", handle: "", hue: 339 },
  { id: "d4229d", name: "OTTA 💰", ticker: "OTTA", wallet: "0xd4229d8166dbaa45689589d59fa968abc840b20f", image: "", x: "", handle: "", hue: 217 },
  { id: "1788c1", name: "话梅糖", ticker: "1788", wallet: "0x1788c1a16f0d4bd404e2d44f90e3d39c9b9a7916", image: "", x: "", handle: "", hue: 153 },
  { id: "7a2363", name: "金狗挖掘机 | 0xDavid", ticker: "XDAV", wallet: "0x7a2363a401b2340c7941dd2eeff0196a5078d2e6", image: "", x: "", handle: "", hue: 180 },
  { id: "bf530f", name: "TANG（恩师峰挖财奶）", ticker: "TANG", wallet: "0xbf530f1bfb23bf332d1f1e41be026a5895fcced4", image: "", x: "", handle: "", hue: 211 },
  { id: "9a44d4", name: "0x9a44…17c0", ticker: "9A44", wallet: "0x9a44d4974cad27175458ee071c189c2619f417c0", image: "", x: "", handle: "", hue: 135 },
  { id: "4b1070", name: "Giann", ticker: "GIAN", wallet: "0x4b10707123c79f6e99be486dcd95d60323988d76", image: "", x: "", handle: "", hue: 1 },
  { id: "9c0f22", name: "LYXR", ticker: "LYXR", wallet: "0x9c0f221c134591f7c9d565548ea4417900302ea3", image: "", x: "", handle: "", hue: 308 },
  { id: "a9f7d9", name: "SKX", ticker: "SKX", wallet: "0xa9f7d92a72428c55f093f6051c43db29f38bf34b", image: "", x: "", handle: "", hue: 90 },
  { id: "c70ad5", name: "CryptoCharming 🐟", ticker: "CRYP", wallet: "0xc70ad5249bc432c7c69d71b017436441e9d6e37a", image: "", x: "", handle: "", hue: 68 },
  { id: "42910a", name: "J777Crypto", ticker: "JCRY", wallet: "0x42910a69effb47b8f8f2cb726fd964a654914131", image: "", x: "", handle: "", hue: 281 },
  { id: "e5e9ff", name: "fhn.gt (🌍,💻)", ticker: "FHNG", wallet: "0xe5e9ffe707ee071998340972af6fb178f5c64ba6", image: "", x: "", handle: "", hue: 303 },
  { id: "e6a5f1", name: "Matt Willemsen", ticker: "MATT", wallet: "0xe6a5f1690fcda05d9ba0a663b6e7ddf3c97eb7b1", image: "", x: "", handle: "", hue: 321 },
  { id: "eeefff", name: "Shenron 🐉", ticker: "SHEN", wallet: "0xeeefff8ce2710fa490e0fcb794235e873c252d2e", image: "", x: "", handle: "", hue: 92 },
  { id: "8e29d0", name: "Tux", ticker: "TUX", wallet: "0x8e29d0e2ca8e92a9f27192616e2e9f170fd2a035", image: "", x: "", handle: "", hue: 2 },
  { id: "ca1a2f", name: "A", ticker: "CA1A", wallet: "0xca1a2fb7f3179d887504966b25d1606978adcd42", image: "", x: "", handle: "", hue: 143 },
  { id: "0f84d2", name: "0x0f84…6767", ticker: "0F84", wallet: "0x0f84d2da979180394fbf9c4499febd0f602a6767", image: "", x: "", handle: "", hue: 170 },
  { id: "d3358b", name: "Potato", ticker: "POTA", wallet: "0xd3358b1f39a6a71911c6e33717d185f99d43e80d", image: "", x: "", handle: "", hue: 359 },
  { id: "6078ee", name: "Inq", ticker: "INQ", wallet: "0x6078ee8a93697c6d67863fcbff77141d9ab358b2", image: "", x: "", handle: "", hue: 82 },
  { id: "990797", name: "H.E. ZEPUMP", ticker: "HEZE", wallet: "0x99079745001f861ce5e0c1a27f8e4ebe55cac12c", image: "", x: "", handle: "", hue: 245 },
  { id: "c2c6ac", name: "Ed_x區塊日記🇭🇰", ticker: "EDX", wallet: "0xc2c6acd377458010713e733e1b21dd6f670d091c", image: "", x: "", handle: "", hue: 355 },
  { id: "963133", name: "Sebastian Orellana", ticker: "SEBA", wallet: "0x9631335762e3603d2a7507d84838aa3236d52745", image: "", x: "", handle: "", hue: 127 },
  { id: "e24da1", name: "rain & coffee", ticker: "RAIN", wallet: "0xe24da1c8f33e1dd8b7993b8b028c7109698ddaa5", image: "", x: "", handle: "", hue: 304 },
  { id: "c65236", name: "杀破狼 WolfyXBT", ticker: "WOLF", wallet: "0xc652368b05a27dd70d135f636536714e2806bd9a", image: "", x: "", handle: "", hue: 83 },
  { id: "e32106", name: "Tekkerrss", ticker: "TEKK", wallet: "0xe3210627730c8e14d6bf2117eab28de531650111", image: "", x: "", handle: "", hue: 215 },
  { id: "5250db", name: "CoCo❕", ticker: "COCO", wallet: "0x5250dbcf6ac11c4c2cbd8dcaf5a6d019f3268ea8", image: "", x: "", handle: "", hue: 303 },
  { id: "a7dcc4", name: "H.E. ZEPUMP", ticker: "HEZE", wallet: "0xa7dcc417c63f24f9073b667a5d7149bd38463d0f", image: "", x: "", handle: "", hue: 111 },
  { id: "5c14c5", name: "Hasan I 哈桑 🇺🇸🇨🇳", ticker: "HASA", wallet: "0x5c14c517991c2bd72c3495efed8c9aefdbd8b8e1", image: "", x: "", handle: "", hue: 287 },
  { id: "f591db", name: "pk", ticker: "PK", wallet: "0xf591db9dccd5d3aaf8508da2cffedd5ef5bb920f", image: "", x: "", handle: "", hue: 61 },
  { id: "7b3d8e", name: "casino", ticker: "CASI", wallet: "0x7b3d8e939ee08b52d06ab5e6f85791a6007e8d61", image: "", x: "", handle: "", hue: 203 },
  { id: "9224bb", name: "DeScientist", ticker: "DESC", wallet: "0x9224bbb4e0fbe2f2f8fab55debc41eb21fdfb804", image: "", x: "", handle: "", hue: 84 },
  { id: "f0f8a6", name: "木木", ticker: "F0F8", wallet: "0xf0f8a6479a428edd0eab965e624800585b62972c", image: "", x: "", handle: "", hue: 335 },
  { id: "b226f9", name: "AlexWong 🇭🇰 | 1000X GEM", ticker: "ALEX", wallet: "0xb226f97bc5b01978848dc440b40c70faea7c006e", image: "", x: "", handle: "", hue: 123 },
  { id: "a1426c", name: "不知名打狗大师🧢", ticker: "A142", wallet: "0xa1426c6f65fe804e05ce3c07a42412d735ef78bc", image: "", x: "", handle: "", hue: 311 },
  { id: "2fcc02", name: "τop τick crypτo 📁 🤖🧠", ticker: "OPIC", wallet: "0x2fcc020f72e5d2edd2a24d04f3dc90d7fdfbd1dd", image: "", x: "", handle: "", hue: 103 },
  { id: "61fd0d", name: "0xᴜᴇzhᴀng|985.eth", ticker: "XZHN", wallet: "0x61fd0d043d519f5a2bd05785000f30db96809429", image: "", x: "", handle: "", hue: 52 },
  { id: "a7d4ff", name: "MIRRO🔶 BNB", ticker: "MIRR", wallet: "0xa7d4ffc4eca3c71af150ce302560a9d04a1d2b9f", image: "", x: "", handle: "", hue: 140 },
  { id: "28aa4f", name: "fierydev 💥", ticker: "FIER", wallet: "0x28aa4f9ffe21365473b64c161b566c3cdead0108", image: "", x: "", handle: "", hue: 103 },
  { id: "b90d9e", name: "从零开始的打狗生活（农场悟道）", ticker: "B90D", wallet: "0xb90d9ea599c2634069ae4d5eecc5ab7234a81a05", image: "", x: "", handle: "", hue: 101 },
  { id: "55fade", name: "0X财神（版本之神）", ticker: "55FA", wallet: "0x55fade80e573c4594b0dd73041297024f1f2ee95", image: "", x: "", handle: "", hue: 160 },
  { id: "a83b73", name: "AntPositions(蚂蚁仓）☄️", ticker: "ANTP", wallet: "0xa83b73f5644cde337b61da79589f10ea15548811", image: "", x: "", handle: "", hue: 197 },
  { id: "023ab8", name: "0x023a…4d66", ticker: "023A", wallet: "0x023ab8e20a4682d315daef4c91db96bd77934d66", image: "", x: "", handle: "", hue: 290 },
  { id: "fea315", name: "游侠🔶Yoxia", ticker: "YOXI", wallet: "0xfea3157ff571174f05fc86af3caee3b870a8495a", image: "", x: "", handle: "", hue: 175 },
  { id: "bf004b", name: "阿峰_Afeng", ticker: "AFEN", wallet: "0xbf004bff64725914ee36d03b87d6965b0ced4903", image: "", x: "", handle: "", hue: 71 },
  { id: "c848a7", name: "Skid", ticker: "SKID", wallet: "0xc848a7530ed12eb545a01eaa906de55f9491fb59", image: "", x: "", handle: "", hue: 267 },
  { id: "9a1ee6", name: "Erison", ticker: "ERIS", wallet: "0x9a1ee67e454bb963183884e7e2872fc0016613d3", image: "", x: "", handle: "", hue: 150 },
  { id: "664d66", name: "Tavern", ticker: "TAVE", wallet: "0x664d6645a04be9e27a8b33088f85025f29d45dc1", image: "", x: "", handle: "", hue: 245 },
  { id: "609f2c", name: "whashywash", ticker: "WHAS", wallet: "0x609f2c912175f8cd4438c1882f291fa6a4b4c735", image: "", x: "", handle: "", hue: 9 },
  { id: "e33b74", name: "Nephew Sam", ticker: "NEPH", wallet: "0xe33b746a030c3b3c512d274b05ea6e40772cf212", image: "", x: "", handle: "", hue: 58 },
  { id: "5ab2d1", name: "Bright Avian | True Pengu King & Hand of Neo T...", ticker: "BRIG", wallet: "0x5ab2d1f5069dd2f9aeec3b0a8e923b1cdbe7fc44", image: "", x: "", handle: "", hue: 77 },
  { id: "2f32c7", name: "Rahim Mahtab", ticker: "RAHI", wallet: "0x2f32c70ecdbb198fc1b13db1db3375c3392cc063", image: "", x: "", handle: "", hue: 190 },
  { id: "f38ce5", name: "professor", ticker: "PROF", wallet: "0xf38ce55fe4e517e77e1056a54e64f22d43d88c3a", image: "", x: "", handle: "", hue: 47 },
  { id: "e475cd", name: "Degenerate Brian", ticker: "DEGE", wallet: "0xe475cd3f0d0a77ec581bb6540abef60b0f3f0d57", image: "", x: "", handle: "", hue: 103 },
  { id: "93585d", name: "加密帅", ticker: "9358", wallet: "0x93585d7f5f15d8bc67f41a12d2b3e3966a1ee6a0", image: "", x: "", handle: "", hue: 335 },
  { id: "a4beae", name: "api5", ticker: "API", wallet: "0xa4beaea04ee42f451f38c771842489d7649b95f2", image: "", x: "", handle: "", hue: 208 },
  { id: "758e83", name: "Cryptk33p3r ❤️ Memecoin", ticker: "CRYP", wallet: "0x758e83c114e36a28ca1f31c4d2adb5ec7c04c578", image: "", x: "", handle: "", hue: 73 },
  { id: "904a5d", name: "bandit", ticker: "BAND", wallet: "0x904a5d05d72a0575c6a60f7de7566abc2ac331e2", image: "", x: "", handle: "", hue: 301 },
  { id: "8d7bbf", name: "Oxxyy", ticker: "OXXY", wallet: "0x8d7bbfa0506ea95c73d864310818acc3e5fa05d9", image: "", x: "", handle: "", hue: 0 },
  { id: "41ccc2", name: "ROCKSTAR", ticker: "ROCK", wallet: "0x41ccc209d3ba4e81ef0c1fcb6d191127fb5b42f5", image: "", x: "", handle: "", hue: 217 },
  { id: "dd6f33", name: "Stigman", ticker: "STIG", wallet: "0xdd6f338b91f40e5a02c468b7cb49cccc569a3134", image: "", x: "", handle: "", hue: 27 },
  { id: "07591d", name: "driz", ticker: "DRIZ", wallet: "0x07591d902e68503c113ac4beca8abb3e3f6b0ab3", image: "", x: "", handle: "", hue: 224 },
  { id: "62e533", name: "leet", ticker: "LEET", wallet: "0x62e5332dcb286f1753d245707c91a38821bb5645", image: "", x: "", handle: "", hue: 213 },
  { id: "2ce9d4", name: "枯坐p小将", ticker: "2CE9", wallet: "0x2ce9d43d1cba6ae31d7f07bfe0098dfa2d833373", image: "", x: "", handle: "", hue: 325 },
  { id: "07cdaf", name: "ozark", ticker: "OZAR", wallet: "0x07cdaf0140c60a0c34681065abf49bb8d85b8cbe", image: "", x: "", handle: "", hue: 73 },
  { id: "d41fea", name: "milito", ticker: "MILI", wallet: "0xd41feaa24dede516a501862cf1f376defb811772", image: "", x: "", handle: "", hue: 114 },
  { id: "da9f48", name: "扑街仔🔶 BNB🎒", ticker: "BNB", wallet: "0xda9f482ea717384af879597303e8b67968afcde2", image: "", x: "", handle: "", hue: 270 },
  { id: "54be3a", name: "dingaling", ticker: "DING", wallet: "0x54be3a794282c030b15e43ae2bb182e14c409c5e", image: "", x: "", handle: "", hue: 273 },
  { id: "061825", name: "Tekkerrss", ticker: "TEKK", wallet: "0x061825a9195a2fb526735032fcac4ef58c6e52e4", image: "", x: "", handle: "", hue: 41 },
  { id: "4d68d0", name: "Jud", ticker: "JUD", wallet: "0x4d68d0ebc52ce41f2ed057f926960df89b0455f9", image: "", x: "", handle: "", hue: 99 },
  { id: "1df316", name: "alkuuu | AP", ticker: "ALKU", wallet: "0x1df3160f73fd6c1bec394c51fc20b7b2a91d6330", image: "", x: "", handle: "", hue: 159 },
  { id: "4a3049", name: "Phero.hl", ticker: "PHER", wallet: "0x4a30496554ef401e4b687189f7df6efe4b3e0249", image: "", x: "", handle: "", hue: 101 },
  { id: "077b99", name: "clukz", ticker: "CLUK", wallet: "0x077b9981bc8a2ca417cea41861111da63266988b", image: "", x: "", handle: "", hue: 97 },
  { id: "38e420", name: "Loopierr", ticker: "LOOP", wallet: "0x38e4203f12b1e74d87deb0083d3c8b51ad9a104e", image: "", x: "", handle: "", hue: 79 },
  { id: "9897b4", name: "K线漂移", ticker: "9897", wallet: "0x9897b49174dc565730ef1d116d80081574ccb3ec", image: "", x: "", handle: "", hue: 193 },
  { id: "3391a3", name: "Rell", ticker: "RELL", wallet: "0x3391a39a1b508e54a361924a26056c01c1c2c07d", image: "", x: "", handle: "", hue: 18 },
  { id: "e28601", name: "NΞO", ticker: "NO", wallet: "0xe28601398a5448d1147e6e8b0e0c6d686f0d216d", image: "", x: "", handle: "", hue: 73 },
  { id: "5fa57f", name: "Veloce", ticker: "VELO", wallet: "0x5fa57fcaf86e137cb8185c4cb2c01ea7b5b14cfb", image: "", x: "", handle: "", hue: 34 },
  { id: "2190d4", name: "0xleonidas", ticker: "XLEO", wallet: "0x2190d4ee2bfc8883c3d71f4b5f41acd7a7287ff5", image: "", x: "", handle: "", hue: 102 },
  { id: "c4df5f", name: "SUN (❖,❖)🍡.edge🦭", ticker: "SUNE", wallet: "0xc4df5f2125151bff3a6aa7328529eae1b9d3cc31", image: "", x: "", handle: "", hue: 217 },
  { id: "92c371", name: "CryptoLucky", ticker: "CRYP", wallet: "0x92c371744e71dbe58c603661ba8784fd76472e1b", image: "", x: "", handle: "", hue: 180 },
  { id: "0cd4d1", name: "Inside Calls", ticker: "INSI", wallet: "0x0cd4d1a9c67a0c7677dcacb37791dadb38ea5666", image: "", x: "", handle: "", hue: 17 },
  { id: "f100af", name: "Tom", ticker: "TOM", wallet: "0xf100af33f90445d1d482fb63df3f6cdb475eeb0f", image: "", x: "", handle: "", hue: 227 },
  { id: "037e6b", name: "Spanny", ticker: "SPAN", wallet: "0x037e6b68ca866598d464a370afa060e4583aa0b8", image: "", x: "", handle: "", hue: 40 },
  { id: "94cf7e", name: "888UP", ticker: "UP", wallet: "0x94cf7ed19901eb7d487c779e6d1baa87157b2d01", image: "", x: "", handle: "", hue: 105 },
  { id: "a866c5", name: "William", ticker: "WILL", wallet: "0xa866c5adddc1c3570b6328491b510deefa374e0d", image: "", x: "", handle: "", hue: 205 },
  { id: "371903", name: "Yoda", ticker: "YODA", wallet: "0x371903abb32f5f69b536b77495e92adedfea25da", image: "", x: "", handle: "", hue: 179 },
  { id: "f78b06", name: "kurtz", ticker: "KURT", wallet: "0xf78b066050e00fdb9b980e265aa9f317ef4b947c", image: "", x: "", handle: "", hue: 8 },
  { id: "069704", name: "summer 🔶 BNB ｜加密盛夏", ticker: "SUMM", wallet: "0x06970464c8b936cda744a454a33f2206dbbbfe49", image: "", x: "", handle: "", hue: 36 },
  { id: "777c47", name: "Apex", ticker: "APEX", wallet: "0x777c47498b42dbe449fb4cb810871a46cd777777", image: "", x: "", handle: "", hue: 57 },
  { id: "a3d3fe", name: "b", ticker: "A3D3", wallet: "0xa3d3fed954a332992cfec8c606eeb2a25fbb3864", image: "", x: "", handle: "", hue: 65 },
  { id: "57825f", name: "TIGER", ticker: "TIGE", wallet: "0x57825f68fc7b32eaaa1e90db1fd6cd997b5a4035", image: "", x: "", handle: "", hue: 176 },
  { id: "49b3e7", name: "Dod✞", ticker: "DOD", wallet: "0x49b3e70dfc8b18654f5335532c17406794ac5ddd", image: "", x: "", handle: "", hue: 301 },
  { id: "1da7f7", name: "十八哥哥🔶BNB", ticker: "BNB", wallet: "0x1da7f7b6069cdbfe53f96db760275836e43b66de", image: "", x: "", handle: "", hue: 190 },
  { id: "683035", name: "tech", ticker: "TECH", wallet: "0x683035da6b84ce48421534c1d3d160a8487cb9bb", image: "", x: "", handle: "", hue: 258 },
  { id: "785234", name: "Han", ticker: "HAN", wallet: "0x7852346c77b3a622fa73607ee35cc784e53f326b", image: "", x: "", handle: "", hue: 92 },
  { id: "3d0631", name: "tech", ticker: "TECH", wallet: "0x3d06315c94ac30b6061c91caf748fc2db04a89f4", image: "", x: "", handle: "", hue: 148 },
  { id: "9db43b", name: "就叫19(角度大师版", ticker: "9DB4", wallet: "0x9db43bb875e10bad12cdf798b14f279e3775ddff", image: "", x: "", handle: "", hue: 280 },
  { id: "7103a4", name: "Simon Squibb", ticker: "SIMO", wallet: "0x7103a46bb31ce7b26972e4e63d1a83e857e7f7ef", image: "", x: "", handle: "", hue: 267 },
  { id: "7551fd", name: "kreo", ticker: "KREO", wallet: "0x7551fd7a88afd941ddcc0a4f1cb62cf85afdae61", image: "", x: "", handle: "", hue: 18 },
  { id: "6e83c5", name: "Surpass", ticker: "SURP", wallet: "0x6e83c54544084b9f6c185456cc9a92b18f981434", image: "", x: "", handle: "", hue: 237 },
  { id: "59f2f5", name: "acid", ticker: "ACID", wallet: "0x59f2f58be6cf6c9b782373eb627d93ed7345fd90", image: "", x: "", handle: "", hue: 355 },
  { id: "3b7bd3", name: "Jinwoo", ticker: "JINW", wallet: "0x3b7bd3fc02e51786e437e813decfe128e468f808", image: "", x: "", handle: "", hue: 180 },
  { id: "18e353", name: "Tripuji🏝️", ticker: "TRIP", wallet: "0x18e3533fe402569b877650f753e877474c171c9d", image: "", x: "", handle: "", hue: 127 },
  { id: "59cb46", name: "Min", ticker: "MIN", wallet: "0x59cb462cd4adabe9734b1c7a8517a1b52d1c36d0", image: "", x: "", handle: "", hue: 196 },
  { id: "d03353", name: "nyhrox", ticker: "NYHR", wallet: "0xd03353d8a531a7b05509f35fadef3e042188bdb5", image: "", x: "", handle: "", hue: 168 },
  { id: "bd6b8d", name: "Cooker.hl | 版本之子 (Theo Arc)", ticker: "COOK", wallet: "0xbd6b8d8fa94f7307840252548549b56a33c98054", image: "", x: "", handle: "", hue: 295 },
];

const FLAT = Array.from({ length: 90 }, () => 0);

export const KOLS: Kol[] = SEEDS.map((s) => ({
  id: s.id,
  handle: s.handle || `${s.wallet.slice(0, 6)}...${s.wallet.slice(-4)}`,
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

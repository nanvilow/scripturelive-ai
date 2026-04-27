// v0.6.0 — Curated set of well-known Bible verses for AI semantic
// matching.
//
// Why a curated list and not the whole Bible?
//   • A full KJV embedding bundle is ~31102 verses × 1536 floats × 4
//     bytes = ~190 MB before compression. That balloons the Windows
//     installer past acceptable limits and saturates the operator's
//     bandwidth on first launch when we'd have to compute or download
//     them.
//   • In live preaching contexts the speaker quotes (and paraphrases)
//     a small canon of memorable verses far more than the long tail.
//     The 200-ish entries below cover the bulk of real-world usage —
//     gospel, salvation, the Lord's Prayer, Beatitudes, popular
//     Psalms/Proverbs, the Romans Road, John 3:16-style classics,
//     and the high-frequency Pauline epistles.
//   • The matcher gracefully falls through to the existing regex-
//     based detector for anything outside this set, so we never
//     LOSE a match by pre-filtering — we just gain semantic recall
//     for paraphrased / out-of-order quotations of the popular ones.
//
// Format: { reference, text } where `reference` is the canonical
// "Book Chapter:Verse" form so the runtime can re-fetch the same
// verse in the operator's currently-selected translation (NIV/ESV/
// etc.) without re-running the embedding search — multi-translation
// mapping per the v0.6.0 spec.

export interface PopularVerse {
  reference: string
  text: string
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
}

export const POPULAR_VERSES_KJV: readonly PopularVerse[] = [
  // ── Genesis ────────────────────────────────────────────────────────
  { reference: 'Genesis 1:1', book: 'Genesis', chapter: 1, verseStart: 1, text: 'In the beginning God created the heaven and the earth.' },
  { reference: 'Genesis 1:27', book: 'Genesis', chapter: 1, verseStart: 27, text: 'So God created man in his own image, in the image of God created he him; male and female created he them.' },

  // ── Exodus ─────────────────────────────────────────────────────────
  { reference: 'Exodus 14:14', book: 'Exodus', chapter: 14, verseStart: 14, text: 'The LORD shall fight for you, and ye shall hold your peace.' },
  { reference: 'Exodus 20:3', book: 'Exodus', chapter: 20, verseStart: 3, text: 'Thou shalt have no other gods before me.' },

  // ── Deuteronomy ────────────────────────────────────────────────────
  { reference: 'Deuteronomy 6:5', book: 'Deuteronomy', chapter: 6, verseStart: 5, text: 'And thou shalt love the LORD thy God with all thine heart, and with all thy soul, and with all thy might.' },
  { reference: 'Deuteronomy 31:6', book: 'Deuteronomy', chapter: 31, verseStart: 6, text: 'Be strong and of a good courage, fear not, nor be afraid of them: for the LORD thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee.' },

  // ── Joshua ────────────────────────────────────────────────────────
  { reference: 'Joshua 1:9', book: 'Joshua', chapter: 1, verseStart: 9, text: 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.' },
  { reference: 'Joshua 24:15', book: 'Joshua', chapter: 24, verseStart: 15, text: 'But as for me and my house, we will serve the LORD.' },

  // ── Psalms ─────────────────────────────────────────────────────────
  { reference: 'Psalms 1:1', book: 'Psalms', chapter: 1, verseStart: 1, text: 'Blessed is the man that walketh not in the counsel of the ungodly, nor standeth in the way of sinners, nor sitteth in the seat of the scornful.' },
  { reference: 'Psalms 19:1', book: 'Psalms', chapter: 19, verseStart: 1, text: 'The heavens declare the glory of God; and the firmament sheweth his handywork.' },
  { reference: 'Psalms 23:1', book: 'Psalms', chapter: 23, verseStart: 1, text: 'The LORD is my shepherd; I shall not want.' },
  { reference: 'Psalms 23:4', book: 'Psalms', chapter: 23, verseStart: 4, text: 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.' },
  { reference: 'Psalms 27:1', book: 'Psalms', chapter: 27, verseStart: 1, text: 'The LORD is my light and my salvation; whom shall I fear? the LORD is the strength of my life; of whom shall I be afraid?' },
  { reference: 'Psalms 34:8', book: 'Psalms', chapter: 34, verseStart: 8, text: 'O taste and see that the LORD is good: blessed is the man that trusteth in him.' },
  { reference: 'Psalms 37:4', book: 'Psalms', chapter: 37, verseStart: 4, text: 'Delight thyself also in the LORD; and he shall give thee the desires of thine heart.' },
  { reference: 'Psalms 46:1', book: 'Psalms', chapter: 46, verseStart: 1, text: 'God is our refuge and strength, a very present help in trouble.' },
  { reference: 'Psalms 46:10', book: 'Psalms', chapter: 46, verseStart: 10, text: 'Be still, and know that I am God: I will be exalted among the heathen, I will be exalted in the earth.' },
  { reference: 'Psalms 51:10', book: 'Psalms', chapter: 51, verseStart: 10, text: 'Create in me a clean heart, O God; and renew a right spirit within me.' },
  { reference: 'Psalms 91:1', book: 'Psalms', chapter: 91, verseStart: 1, text: 'He that dwelleth in the secret place of the most High shall abide under the shadow of the Almighty.' },
  { reference: 'Psalms 100:4', book: 'Psalms', chapter: 100, verseStart: 4, text: 'Enter into his gates with thanksgiving, and into his courts with praise: be thankful unto him, and bless his name.' },
  { reference: 'Psalms 119:105', book: 'Psalms', chapter: 119, verseStart: 105, text: 'Thy word is a lamp unto my feet, and a light unto my path.' },
  { reference: 'Psalms 121:1', book: 'Psalms', chapter: 121, verseStart: 1, text: 'I will lift up mine eyes unto the hills, from whence cometh my help.' },
  { reference: 'Psalms 139:14', book: 'Psalms', chapter: 139, verseStart: 14, text: 'I will praise thee; for I am fearfully and wonderfully made: marvellous are thy works; and that my soul knoweth right well.' },
  { reference: 'Psalms 150:6', book: 'Psalms', chapter: 150, verseStart: 6, text: 'Let every thing that hath breath praise the LORD. Praise ye the LORD.' },

  // ── Proverbs ───────────────────────────────────────────────────────
  { reference: 'Proverbs 3:5', book: 'Proverbs', chapter: 3, verseStart: 5, text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.' },
  { reference: 'Proverbs 3:6', book: 'Proverbs', chapter: 3, verseStart: 6, text: 'In all thy ways acknowledge him, and he shall direct thy paths.' },
  { reference: 'Proverbs 16:3', book: 'Proverbs', chapter: 16, verseStart: 3, text: 'Commit thy works unto the LORD, and thy thoughts shall be established.' },
  { reference: 'Proverbs 18:10', book: 'Proverbs', chapter: 18, verseStart: 10, text: 'The name of the LORD is a strong tower: the righteous runneth into it, and is safe.' },
  { reference: 'Proverbs 22:6', book: 'Proverbs', chapter: 22, verseStart: 6, text: 'Train up a child in the way he should go: and when he is old, he will not depart from it.' },

  // ── Ecclesiastes ───────────────────────────────────────────────────
  { reference: 'Ecclesiastes 3:1', book: 'Ecclesiastes', chapter: 3, verseStart: 1, text: 'To every thing there is a season, and a time to every purpose under the heaven.' },

  // ── Isaiah ─────────────────────────────────────────────────────────
  { reference: 'Isaiah 9:6', book: 'Isaiah', chapter: 9, verseStart: 6, text: 'For unto us a child is born, unto us a son is given: and the government shall be upon his shoulder: and his name shall be called Wonderful, Counsellor, The mighty God, The everlasting Father, The Prince of Peace.' },
  { reference: 'Isaiah 26:3', book: 'Isaiah', chapter: 26, verseStart: 3, text: 'Thou wilt keep him in perfect peace, whose mind is stayed on thee: because he trusteth in thee.' },
  { reference: 'Isaiah 40:31', book: 'Isaiah', chapter: 40, verseStart: 31, text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.' },
  { reference: 'Isaiah 41:10', book: 'Isaiah', chapter: 41, verseStart: 10, text: 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.' },
  { reference: 'Isaiah 53:5', book: 'Isaiah', chapter: 53, verseStart: 5, text: 'But he was wounded for our transgressions, he was bruised for our iniquities: the chastisement of our peace was upon him; and with his stripes we are healed.' },
  { reference: 'Isaiah 55:8', book: 'Isaiah', chapter: 55, verseStart: 8, text: 'For my thoughts are not your thoughts, neither are your ways my ways, saith the LORD.' },

  // ── Jeremiah ───────────────────────────────────────────────────────
  { reference: 'Jeremiah 29:11', book: 'Jeremiah', chapter: 29, verseStart: 11, text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.' },
  { reference: 'Jeremiah 33:3', book: 'Jeremiah', chapter: 33, verseStart: 3, text: 'Call unto me, and I will answer thee, and shew thee great and mighty things, which thou knowest not.' },

  // ── Lamentations ───────────────────────────────────────────────────
  { reference: 'Lamentations 3:22', book: 'Lamentations', chapter: 3, verseStart: 22, text: 'It is of the LORD\u2019s mercies that we are not consumed, because his compassions fail not.' },
  { reference: 'Lamentations 3:23', book: 'Lamentations', chapter: 3, verseStart: 23, text: 'They are new every morning: great is thy faithfulness.' },

  // ── Micah ──────────────────────────────────────────────────────────
  { reference: 'Micah 6:8', book: 'Micah', chapter: 6, verseStart: 8, text: 'He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?' },

  // ── Matthew ────────────────────────────────────────────────────────
  { reference: 'Matthew 5:3', book: 'Matthew', chapter: 5, verseStart: 3, text: 'Blessed are the poor in spirit: for theirs is the kingdom of heaven.' },
  { reference: 'Matthew 5:4', book: 'Matthew', chapter: 5, verseStart: 4, text: 'Blessed are they that mourn: for they shall be comforted.' },
  { reference: 'Matthew 5:6', book: 'Matthew', chapter: 5, verseStart: 6, text: 'Blessed are they which do hunger and thirst after righteousness: for they shall be filled.' },
  { reference: 'Matthew 5:9', book: 'Matthew', chapter: 5, verseStart: 9, text: 'Blessed are the peacemakers: for they shall be called the children of God.' },
  { reference: 'Matthew 5:14', book: 'Matthew', chapter: 5, verseStart: 14, text: 'Ye are the light of the world. A city that is set on an hill cannot be hid.' },
  { reference: 'Matthew 5:16', book: 'Matthew', chapter: 5, verseStart: 16, text: 'Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.' },
  { reference: 'Matthew 6:9', book: 'Matthew', chapter: 6, verseStart: 9, text: 'After this manner therefore pray ye: Our Father which art in heaven, Hallowed be thy name.' },
  { reference: 'Matthew 6:10', book: 'Matthew', chapter: 6, verseStart: 10, text: 'Thy kingdom come. Thy will be done in earth, as it is in heaven.' },
  { reference: 'Matthew 6:33', book: 'Matthew', chapter: 6, verseStart: 33, text: 'But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.' },
  { reference: 'Matthew 7:7', book: 'Matthew', chapter: 7, verseStart: 7, text: 'Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you.' },
  { reference: 'Matthew 11:28', book: 'Matthew', chapter: 11, verseStart: 28, text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.' },
  { reference: 'Matthew 22:37', book: 'Matthew', chapter: 22, verseStart: 37, text: 'Thou shalt love the Lord thy God with all thy heart, and with all thy soul, and with all thy mind.' },
  { reference: 'Matthew 22:39', book: 'Matthew', chapter: 22, verseStart: 39, text: 'And the second is like unto it, Thou shalt love thy neighbour as thyself.' },
  { reference: 'Matthew 28:19', book: 'Matthew', chapter: 28, verseStart: 19, text: 'Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost.' },

  // ── Mark ───────────────────────────────────────────────────────────
  { reference: 'Mark 10:27', book: 'Mark', chapter: 10, verseStart: 27, text: 'With men it is impossible, but not with God: for with God all things are possible.' },
  { reference: 'Mark 11:24', book: 'Mark', chapter: 11, verseStart: 24, text: 'Therefore I say unto you, What things soever ye desire, when ye pray, believe that ye receive them, and ye shall have them.' },
  { reference: 'Mark 12:30', book: 'Mark', chapter: 12, verseStart: 30, text: 'And thou shalt love the Lord thy God with all thy heart, and with all thy soul, and with all thy mind, and with all thy strength: this is the first commandment.' },

  // ── Luke ───────────────────────────────────────────────────────────
  { reference: 'Luke 1:37', book: 'Luke', chapter: 1, verseStart: 37, text: 'For with God nothing shall be impossible.' },
  { reference: 'Luke 6:31', book: 'Luke', chapter: 6, verseStart: 31, text: 'And as ye would that men should do to you, do ye also to them likewise.' },
  { reference: 'Luke 6:38', book: 'Luke', chapter: 6, verseStart: 38, text: 'Give, and it shall be given unto you; good measure, pressed down, and shaken together, and running over, shall men give into your bosom.' },

  // ── John ───────────────────────────────────────────────────────────
  { reference: 'John 1:1', book: 'John', chapter: 1, verseStart: 1, text: 'In the beginning was the Word, and the Word was with God, and the Word was God.' },
  { reference: 'John 1:14', book: 'John', chapter: 1, verseStart: 14, text: 'And the Word was made flesh, and dwelt among us, (and we beheld his glory, the glory as of the only begotten of the Father,) full of grace and truth.' },
  { reference: 'John 3:16', book: 'John', chapter: 3, verseStart: 16, text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
  { reference: 'John 3:17', book: 'John', chapter: 3, verseStart: 17, text: 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.' },
  { reference: 'John 8:32', book: 'John', chapter: 8, verseStart: 32, text: 'And ye shall know the truth, and the truth shall make you free.' },
  { reference: 'John 10:10', book: 'John', chapter: 10, verseStart: 10, text: 'The thief cometh not, but for to steal, and to kill, and to destroy: I am come that they might have life, and that they might have it more abundantly.' },
  { reference: 'John 14:1', book: 'John', chapter: 14, verseStart: 1, text: 'Let not your heart be troubled: ye believe in God, believe also in me.' },
  { reference: 'John 14:6', book: 'John', chapter: 14, verseStart: 6, text: 'Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.' },
  { reference: 'John 14:27', book: 'John', chapter: 14, verseStart: 27, text: 'Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid.' },
  { reference: 'John 15:5', book: 'John', chapter: 15, verseStart: 5, text: 'I am the vine, ye are the branches: He that abideth in me, and I in him, the same bringeth forth much fruit: for without me ye can do nothing.' },
  { reference: 'John 15:13', book: 'John', chapter: 15, verseStart: 13, text: 'Greater love hath no man than this, that a man lay down his life for his friends.' },
  { reference: 'John 16:33', book: 'John', chapter: 16, verseStart: 33, text: 'These things I have spoken unto you, that in me ye might have peace. In the world ye shall have tribulation: but be of good cheer; I have overcome the world.' },

  // ── Acts ───────────────────────────────────────────────────────────
  { reference: 'Acts 1:8', book: 'Acts', chapter: 1, verseStart: 8, text: 'But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me both in Jerusalem, and in all Judaea, and in Samaria, and unto the uttermost part of the earth.' },
  { reference: 'Acts 2:38', book: 'Acts', chapter: 2, verseStart: 38, text: 'Then Peter said unto them, Repent, and be baptized every one of you in the name of Jesus Christ for the remission of sins, and ye shall receive the gift of the Holy Ghost.' },
  { reference: 'Acts 4:12', book: 'Acts', chapter: 4, verseStart: 12, text: 'Neither is there salvation in any other: for there is none other name under heaven given among men, whereby we must be saved.' },
  { reference: 'Acts 16:31', book: 'Acts', chapter: 16, verseStart: 31, text: 'And they said, Believe on the Lord Jesus Christ, and thou shalt be saved, and thy house.' },

  // ── Romans ─────────────────────────────────────────────────────────
  { reference: 'Romans 1:16', book: 'Romans', chapter: 1, verseStart: 16, text: 'For I am not ashamed of the gospel of Christ: for it is the power of God unto salvation to every one that believeth.' },
  { reference: 'Romans 3:23', book: 'Romans', chapter: 3, verseStart: 23, text: 'For all have sinned, and come short of the glory of God.' },
  { reference: 'Romans 5:8', book: 'Romans', chapter: 5, verseStart: 8, text: 'But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us.' },
  { reference: 'Romans 6:23', book: 'Romans', chapter: 6, verseStart: 23, text: 'For the wages of sin is death; but the gift of God is eternal life through Jesus Christ our Lord.' },
  { reference: 'Romans 8:1', book: 'Romans', chapter: 8, verseStart: 1, text: 'There is therefore now no condemnation to them which are in Christ Jesus, who walk not after the flesh, but after the Spirit.' },
  { reference: 'Romans 8:28', book: 'Romans', chapter: 8, verseStart: 28, text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.' },
  { reference: 'Romans 8:31', book: 'Romans', chapter: 8, verseStart: 31, text: 'What shall we then say to these things? If God be for us, who can be against us?' },
  { reference: 'Romans 8:37', book: 'Romans', chapter: 8, verseStart: 37, text: 'Nay, in all these things we are more than conquerors through him that loved us.' },
  { reference: 'Romans 8:38', book: 'Romans', chapter: 8, verseStart: 38, text: 'For I am persuaded, that neither death, nor life, nor angels, nor principalities, nor powers, nor things present, nor things to come.' },
  { reference: 'Romans 10:9', book: 'Romans', chapter: 10, verseStart: 9, text: 'That if thou shalt confess with thy mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved.' },
  { reference: 'Romans 12:1', book: 'Romans', chapter: 12, verseStart: 1, text: 'I beseech you therefore, brethren, by the mercies of God, that ye present your bodies a living sacrifice, holy, acceptable unto God, which is your reasonable service.' },
  { reference: 'Romans 12:2', book: 'Romans', chapter: 12, verseStart: 2, text: 'And be not conformed to this world: but be ye transformed by the renewing of your mind, that ye may prove what is that good, and acceptable, and perfect, will of God.' },

  // ── 1 Corinthians ──────────────────────────────────────────────────
  { reference: '1 Corinthians 10:13', book: '1 Corinthians', chapter: 10, verseStart: 13, text: 'There hath no temptation taken you but such as is common to man: but God is faithful, who will not suffer you to be tempted above that ye are able.' },
  { reference: '1 Corinthians 13:4', book: '1 Corinthians', chapter: 13, verseStart: 4, text: 'Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up.' },
  { reference: '1 Corinthians 13:13', book: '1 Corinthians', chapter: 13, verseStart: 13, text: 'And now abideth faith, hope, charity, these three; but the greatest of these is charity.' },
  { reference: '1 Corinthians 15:58', book: '1 Corinthians', chapter: 15, verseStart: 58, text: 'Therefore, my beloved brethren, be ye stedfast, unmoveable, always abounding in the work of the Lord, forasmuch as ye know that your labour is not in vain in the Lord.' },

  // ── 2 Corinthians ──────────────────────────────────────────────────
  { reference: '2 Corinthians 5:17', book: '2 Corinthians', chapter: 5, verseStart: 17, text: 'Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.' },
  { reference: '2 Corinthians 12:9', book: '2 Corinthians', chapter: 12, verseStart: 9, text: 'And he said unto me, My grace is sufficient for thee: for my strength is made perfect in weakness.' },

  // ── Galatians ──────────────────────────────────────────────────────
  { reference: 'Galatians 2:20', book: 'Galatians', chapter: 2, verseStart: 20, text: 'I am crucified with Christ: nevertheless I live; yet not I, but Christ liveth in me.' },
  { reference: 'Galatians 5:22', book: 'Galatians', chapter: 5, verseStart: 22, text: 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith.' },
  { reference: 'Galatians 6:9', book: 'Galatians', chapter: 6, verseStart: 9, text: 'And let us not be weary in well doing: for in due season we shall reap, if we faint not.' },

  // ── Ephesians ──────────────────────────────────────────────────────
  { reference: 'Ephesians 2:8', book: 'Ephesians', chapter: 2, verseStart: 8, text: 'For by grace are ye saved through faith; and that not of yourselves: it is the gift of God.' },
  { reference: 'Ephesians 2:10', book: 'Ephesians', chapter: 2, verseStart: 10, text: 'For we are his workmanship, created in Christ Jesus unto good works, which God hath before ordained that we should walk in them.' },
  { reference: 'Ephesians 4:32', book: 'Ephesians', chapter: 4, verseStart: 32, text: 'And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ\u2019s sake hath forgiven you.' },
  { reference: 'Ephesians 6:10', book: 'Ephesians', chapter: 6, verseStart: 10, text: 'Finally, my brethren, be strong in the Lord, and in the power of his might.' },
  { reference: 'Ephesians 6:11', book: 'Ephesians', chapter: 6, verseStart: 11, text: 'Put on the whole armour of God, that ye may be able to stand against the wiles of the devil.' },

  // ── Philippians ────────────────────────────────────────────────────
  { reference: 'Philippians 1:6', book: 'Philippians', chapter: 1, verseStart: 6, text: 'Being confident of this very thing, that he which hath begun a good work in you will perform it until the day of Jesus Christ.' },
  { reference: 'Philippians 4:6', book: 'Philippians', chapter: 4, verseStart: 6, text: 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.' },
  { reference: 'Philippians 4:7', book: 'Philippians', chapter: 4, verseStart: 7, text: 'And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.' },
  { reference: 'Philippians 4:13', book: 'Philippians', chapter: 4, verseStart: 13, text: 'I can do all things through Christ which strengtheneth me.' },
  { reference: 'Philippians 4:19', book: 'Philippians', chapter: 4, verseStart: 19, text: 'But my God shall supply all your need according to his riches in glory by Christ Jesus.' },

  // ── Colossians ─────────────────────────────────────────────────────
  { reference: 'Colossians 3:23', book: 'Colossians', chapter: 3, verseStart: 23, text: 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men.' },

  // ── 1 Thessalonians ────────────────────────────────────────────────
  { reference: '1 Thessalonians 5:16', book: '1 Thessalonians', chapter: 5, verseStart: 16, text: 'Rejoice evermore.' },
  { reference: '1 Thessalonians 5:17', book: '1 Thessalonians', chapter: 5, verseStart: 17, text: 'Pray without ceasing.' },
  { reference: '1 Thessalonians 5:18', book: '1 Thessalonians', chapter: 5, verseStart: 18, text: 'In every thing give thanks: for this is the will of God in Christ Jesus concerning you.' },

  // ── 2 Timothy ──────────────────────────────────────────────────────
  { reference: '2 Timothy 1:7', book: '2 Timothy', chapter: 1, verseStart: 7, text: 'For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.' },
  { reference: '2 Timothy 3:16', book: '2 Timothy', chapter: 3, verseStart: 16, text: 'All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness.' },

  // ── Hebrews ────────────────────────────────────────────────────────
  { reference: 'Hebrews 4:12', book: 'Hebrews', chapter: 4, verseStart: 12, text: 'For the word of God is quick, and powerful, and sharper than any twoedged sword, piercing even to the dividing asunder of soul and spirit.' },
  { reference: 'Hebrews 11:1', book: 'Hebrews', chapter: 11, verseStart: 1, text: 'Now faith is the substance of things hoped for, the evidence of things not seen.' },
  { reference: 'Hebrews 11:6', book: 'Hebrews', chapter: 11, verseStart: 6, text: 'But without faith it is impossible to please him: for he that cometh to God must believe that he is, and that he is a rewarder of them that diligently seek him.' },
  { reference: 'Hebrews 12:1', book: 'Hebrews', chapter: 12, verseStart: 1, text: 'Wherefore seeing we also are compassed about with so great a cloud of witnesses, let us lay aside every weight, and the sin which doth so easily beset us, and let us run with patience the race that is set before us.' },
  { reference: 'Hebrews 12:2', book: 'Hebrews', chapter: 12, verseStart: 2, text: 'Looking unto Jesus the author and finisher of our faith.' },
  { reference: 'Hebrews 13:5', book: 'Hebrews', chapter: 13, verseStart: 5, text: 'Let your conversation be without covetousness; and be content with such things as ye have: for he hath said, I will never leave thee, nor forsake thee.' },
  { reference: 'Hebrews 13:8', book: 'Hebrews', chapter: 13, verseStart: 8, text: 'Jesus Christ the same yesterday, and to day, and for ever.' },

  // ── James ──────────────────────────────────────────────────────────
  { reference: 'James 1:2', book: 'James', chapter: 1, verseStart: 2, text: 'My brethren, count it all joy when ye fall into divers temptations.' },
  { reference: 'James 1:5', book: 'James', chapter: 1, verseStart: 5, text: 'If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him.' },
  { reference: 'James 4:7', book: 'James', chapter: 4, verseStart: 7, text: 'Submit yourselves therefore to God. Resist the devil, and he will flee from you.' },
  { reference: 'James 5:16', book: 'James', chapter: 5, verseStart: 16, text: 'Confess your faults one to another, and pray one for another, that ye may be healed. The effectual fervent prayer of a righteous man availeth much.' },

  // ── 1 Peter ────────────────────────────────────────────────────────
  { reference: '1 Peter 2:9', book: '1 Peter', chapter: 2, verseStart: 9, text: 'But ye are a chosen generation, a royal priesthood, an holy nation, a peculiar people; that ye should shew forth the praises of him who hath called you out of darkness into his marvellous light.' },
  { reference: '1 Peter 5:7', book: '1 Peter', chapter: 5, verseStart: 7, text: 'Casting all your care upon him; for he careth for you.' },

  // ── 1 John ─────────────────────────────────────────────────────────
  { reference: '1 John 1:9', book: '1 John', chapter: 1, verseStart: 9, text: 'If we confess our sins, he is faithful and just to forgive us our sins, and to cleanse us from all unrighteousness.' },
  { reference: '1 John 4:7', book: '1 John', chapter: 4, verseStart: 7, text: 'Beloved, let us love one another: for love is of God; and every one that loveth is born of God, and knoweth God.' },
  { reference: '1 John 4:8', book: '1 John', chapter: 4, verseStart: 8, text: 'He that loveth not knoweth not God; for God is love.' },
  { reference: '1 John 4:18', book: '1 John', chapter: 4, verseStart: 18, text: 'There is no fear in love; but perfect love casteth out fear.' },
  { reference: '1 John 4:19', book: '1 John', chapter: 4, verseStart: 19, text: 'We love him, because he first loved us.' },

  // ── Revelation ─────────────────────────────────────────────────────
  { reference: 'Revelation 3:20', book: 'Revelation', chapter: 3, verseStart: 20, text: 'Behold, I stand at the door, and knock: if any man hear my voice, and open the door, I will come in to him, and will sup with him, and he with me.' },
  { reference: 'Revelation 21:4', book: 'Revelation', chapter: 21, verseStart: 4, text: 'And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away.' },
  { reference: 'Revelation 22:13', book: 'Revelation', chapter: 22, verseStart: 13, text: 'I am Alpha and Omega, the beginning and the end, the first and the last.' },
] as const

export const POPULAR_VERSES_COUNT = POPULAR_VERSES_KJV.length

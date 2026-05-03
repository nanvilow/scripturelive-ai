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
  // v0.7.60 — Operator report: speaker said "in his time he make all
  // things" and the system failed to bring up the verse. Adding the
  // canonical KJV text for Ecclesiastes 3:11 so the semantic matcher
  // can recover this paraphrase.
  { reference: 'Ecclesiastes 3:11', book: 'Ecclesiastes', chapter: 3, verseStart: 11, text: 'He hath made every thing beautiful in his time: also he hath set the world in their heart, so that no man can find out the work that God maketh from the beginning to the end.' },

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

  // ════════════════════════════════════════════════════════════════════
  // v0.6.1 EXPANSION — 175 ADDITIONAL POPULAR VERSES
  // Operator requested 300+ seed verses (was 135) so we cover more of
  // what preachers actually quote: deeper Psalms/Prophets, the rest of
  // the Beatitudes, fuller Pauline corpus, Hebrews 11 hall-of-faith,
  // Revelation closings, plus high-frequency Old-Testament narrative.
  // ════════════════════════════════════════════════════════════════════

  // ── Genesis (additions) ───────────────────────────────────────────
  { reference: 'Genesis 1:3', book: 'Genesis', chapter: 1, verseStart: 3, text: 'And God said, Let there be light: and there was light.' },
  { reference: 'Genesis 1:31', book: 'Genesis', chapter: 1, verseStart: 31, text: 'And God saw every thing that he had made, and, behold, it was very good.' },
  { reference: 'Genesis 2:24', book: 'Genesis', chapter: 2, verseStart: 24, text: 'Therefore shall a man leave his father and his mother, and shall cleave unto his wife: and they shall be one flesh.' },
  { reference: 'Genesis 12:2', book: 'Genesis', chapter: 12, verseStart: 2, text: 'And I will make of thee a great nation, and I will bless thee, and make thy name great; and thou shalt be a blessing.' },
  { reference: 'Genesis 50:20', book: 'Genesis', chapter: 50, verseStart: 20, text: 'But as for you, ye thought evil against me; but God meant it unto good, to bring to pass, as it is this day, to save much people alive.' },

  // ── Exodus / Leviticus / Numbers (additions) ──────────────────────
  { reference: 'Exodus 3:14', book: 'Exodus', chapter: 3, verseStart: 14, text: 'And God said unto Moses, I AM THAT I AM: and he said, Thus shalt thou say unto the children of Israel, I AM hath sent me unto you.' },
  { reference: 'Exodus 15:2', book: 'Exodus', chapter: 15, verseStart: 2, text: 'The LORD is my strength and song, and he is become my salvation: he is my God, and I will prepare him an habitation; my father\u2019s God, and I will exalt him.' },
  { reference: 'Exodus 20:12', book: 'Exodus', chapter: 20, verseStart: 12, text: 'Honour thy father and thy mother: that thy days may be long upon the land which the LORD thy God giveth thee.' },
  { reference: 'Leviticus 19:18', book: 'Leviticus', chapter: 19, verseStart: 18, text: 'Thou shalt not avenge, nor bear any grudge against the children of thy people, but thou shalt love thy neighbour as thyself: I am the LORD.' },
  { reference: 'Numbers 6:24', book: 'Numbers', chapter: 6, verseStart: 24, text: 'The LORD bless thee, and keep thee.' },
  { reference: 'Numbers 6:25', book: 'Numbers', chapter: 6, verseStart: 25, text: 'The LORD make his face shine upon thee, and be gracious unto thee.' },
  { reference: 'Numbers 6:26', book: 'Numbers', chapter: 6, verseStart: 26, text: 'The LORD lift up his countenance upon thee, and give thee peace.' },
  { reference: 'Numbers 23:19', book: 'Numbers', chapter: 23, verseStart: 19, text: 'God is not a man, that he should lie; neither the son of man, that he should repent: hath he said, and shall he not do it? or hath he spoken, and shall he not make it good?' },

  // ── Deuteronomy (additions) ───────────────────────────────────────
  { reference: 'Deuteronomy 6:4', book: 'Deuteronomy', chapter: 6, verseStart: 4, text: 'Hear, O Israel: The LORD our God is one LORD.' },
  { reference: 'Deuteronomy 8:3', book: 'Deuteronomy', chapter: 8, verseStart: 3, text: 'Man doth not live by bread only, but by every word that proceedeth out of the mouth of the LORD doth man live.' },
  { reference: 'Deuteronomy 28:1', book: 'Deuteronomy', chapter: 28, verseStart: 1, text: 'And it shall come to pass, if thou shalt hearken diligently unto the voice of the LORD thy God, that the LORD thy God will set thee on high above all nations of the earth.' },

  // ── 1 Samuel / 2 Samuel / 1 Kings ────────────────────────────────
  { reference: '1 Samuel 16:7', book: '1 Samuel', chapter: 16, verseStart: 7, text: 'For the LORD seeth not as man seeth; for man looketh on the outward appearance, but the LORD looketh on the heart.' },
  { reference: '1 Samuel 17:47', book: '1 Samuel', chapter: 17, verseStart: 47, text: 'For the battle is the LORD\u2019s, and he will give you into our hands.' },
  { reference: '2 Samuel 22:31', book: '2 Samuel', chapter: 22, verseStart: 31, text: 'As for God, his way is perfect; the word of the LORD is tried: he is a buckler to all them that trust in him.' },
  { reference: '1 Kings 8:23', book: '1 Kings', chapter: 8, verseStart: 23, text: 'LORD God of Israel, there is no God like thee, in heaven above, or on earth beneath, who keepest covenant and mercy with thy servants.' },

  // ── 1 Chronicles / 2 Chronicles / Nehemiah ────────────────────────
  { reference: '1 Chronicles 16:11', book: '1 Chronicles', chapter: 16, verseStart: 11, text: 'Seek the LORD and his strength, seek his face continually.' },
  { reference: '1 Chronicles 29:11', book: '1 Chronicles', chapter: 29, verseStart: 11, text: 'Thine, O LORD, is the greatness, and the power, and the glory, and the victory, and the majesty: for all that is in the heaven and in the earth is thine.' },
  { reference: '2 Chronicles 7:14', book: '2 Chronicles', chapter: 7, verseStart: 14, text: 'If my people, which are called by my name, shall humble themselves, and pray, and seek my face, and turn from their wicked ways; then will I hear from heaven, and will forgive their sin, and will heal their land.' },
  { reference: 'Nehemiah 8:10', book: 'Nehemiah', chapter: 8, verseStart: 10, text: 'For the joy of the LORD is your strength.' },

  // ── Job (additions) ───────────────────────────────────────────────
  { reference: 'Job 1:21', book: 'Job', chapter: 1, verseStart: 21, text: 'The LORD gave, and the LORD hath taken away; blessed be the name of the LORD.' },
  { reference: 'Job 19:25', book: 'Job', chapter: 19, verseStart: 25, text: 'For I know that my redeemer liveth, and that he shall stand at the latter day upon the earth.' },
  { reference: 'Job 23:10', book: 'Job', chapter: 23, verseStart: 10, text: 'But he knoweth the way that I take: when he hath tried me, I shall come forth as gold.' },

  // ── Psalms (deep dive — sermon staples) ───────────────────────────
  { reference: 'Psalms 8:3', book: 'Psalms', chapter: 8, verseStart: 3, text: 'When I consider thy heavens, the work of thy fingers, the moon and the stars, which thou hast ordained.' },
  { reference: 'Psalms 16:11', book: 'Psalms', chapter: 16, verseStart: 11, text: 'Thou wilt shew me the path of life: in thy presence is fulness of joy; at thy right hand there are pleasures for evermore.' },
  { reference: 'Psalms 18:2', book: 'Psalms', chapter: 18, verseStart: 2, text: 'The LORD is my rock, and my fortress, and my deliverer; my God, my strength, in whom I will trust.' },
  { reference: 'Psalms 19:14', book: 'Psalms', chapter: 19, verseStart: 14, text: 'Let the words of my mouth, and the meditation of my heart, be acceptable in thy sight, O LORD, my strength, and my redeemer.' },
  { reference: 'Psalms 23:2', book: 'Psalms', chapter: 23, verseStart: 2, text: 'He maketh me to lie down in green pastures: he leadeth me beside the still waters.' },
  { reference: 'Psalms 23:3', book: 'Psalms', chapter: 23, verseStart: 3, text: 'He restoreth my soul: he leadeth me in the paths of righteousness for his name\u2019s sake.' },
  { reference: 'Psalms 23:5', book: 'Psalms', chapter: 23, verseStart: 5, text: 'Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.' },
  { reference: 'Psalms 23:6', book: 'Psalms', chapter: 23, verseStart: 6, text: 'Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.' },
  { reference: 'Psalms 27:14', book: 'Psalms', chapter: 27, verseStart: 14, text: 'Wait on the LORD: be of good courage, and he shall strengthen thine heart: wait, I say, on the LORD.' },
  { reference: 'Psalms 30:5', book: 'Psalms', chapter: 30, verseStart: 5, text: 'For his anger endureth but a moment; in his favour is life: weeping may endure for a night, but joy cometh in the morning.' },
  { reference: 'Psalms 32:8', book: 'Psalms', chapter: 32, verseStart: 8, text: 'I will instruct thee and teach thee in the way which thou shalt go: I will guide thee with mine eye.' },
  { reference: 'Psalms 34:18', book: 'Psalms', chapter: 34, verseStart: 18, text: 'The LORD is nigh unto them that are of a broken heart; and saveth such as be of a contrite spirit.' },
  { reference: 'Psalms 37:23', book: 'Psalms', chapter: 37, verseStart: 23, text: 'The steps of a good man are ordered by the LORD: and he delighteth in his way.' },
  { reference: 'Psalms 42:1', book: 'Psalms', chapter: 42, verseStart: 1, text: 'As the hart panteth after the water brooks, so panteth my soul after thee, O God.' },
  { reference: 'Psalms 42:11', book: 'Psalms', chapter: 42, verseStart: 11, text: 'Why art thou cast down, O my soul? and why art thou disquieted within me? hope thou in God: for I shall yet praise him.' },
  { reference: 'Psalms 55:22', book: 'Psalms', chapter: 55, verseStart: 22, text: 'Cast thy burden upon the LORD, and he shall sustain thee: he shall never suffer the righteous to be moved.' },
  { reference: 'Psalms 56:3', book: 'Psalms', chapter: 56, verseStart: 3, text: 'What time I am afraid, I will trust in thee.' },
  { reference: 'Psalms 62:1', book: 'Psalms', chapter: 62, verseStart: 1, text: 'Truly my soul waiteth upon God: from him cometh my salvation.' },
  { reference: 'Psalms 73:26', book: 'Psalms', chapter: 73, verseStart: 26, text: 'My flesh and my heart faileth: but God is the strength of my heart, and my portion for ever.' },
  { reference: 'Psalms 84:10', book: 'Psalms', chapter: 84, verseStart: 10, text: 'For a day in thy courts is better than a thousand. I had rather be a doorkeeper in the house of my God, than to dwell in the tents of wickedness.' },
  { reference: 'Psalms 90:12', book: 'Psalms', chapter: 90, verseStart: 12, text: 'So teach us to number our days, that we may apply our hearts unto wisdom.' },
  { reference: 'Psalms 91:11', book: 'Psalms', chapter: 91, verseStart: 11, text: 'For he shall give his angels charge over thee, to keep thee in all thy ways.' },
  { reference: 'Psalms 100:3', book: 'Psalms', chapter: 100, verseStart: 3, text: 'Know ye that the LORD he is God: it is he that hath made us, and not we ourselves; we are his people, and the sheep of his pasture.' },
  { reference: 'Psalms 103:1', book: 'Psalms', chapter: 103, verseStart: 1, text: 'Bless the LORD, O my soul: and all that is within me, bless his holy name.' },
  { reference: 'Psalms 103:2', book: 'Psalms', chapter: 103, verseStart: 2, text: 'Bless the LORD, O my soul, and forget not all his benefits.' },
  { reference: 'Psalms 103:8', book: 'Psalms', chapter: 103, verseStart: 8, text: 'The LORD is merciful and gracious, slow to anger, and plenteous in mercy.' },
  { reference: 'Psalms 103:12', book: 'Psalms', chapter: 103, verseStart: 12, text: 'As far as the east is from the west, so far hath he removed our transgressions from us.' },
  { reference: 'Psalms 118:24', book: 'Psalms', chapter: 118, verseStart: 24, text: 'This is the day which the LORD hath made; we will rejoice and be glad in it.' },
  { reference: 'Psalms 119:11', book: 'Psalms', chapter: 119, verseStart: 11, text: 'Thy word have I hid in mine heart, that I might not sin against thee.' },
  { reference: 'Psalms 127:1', book: 'Psalms', chapter: 127, verseStart: 1, text: 'Except the LORD build the house, they labour in vain that build it: except the LORD keep the city, the watchman waketh but in vain.' },
  { reference: 'Psalms 133:1', book: 'Psalms', chapter: 133, verseStart: 1, text: 'Behold, how good and how pleasant it is for brethren to dwell together in unity!' },
  { reference: 'Psalms 139:23', book: 'Psalms', chapter: 139, verseStart: 23, text: 'Search me, O God, and know my heart: try me, and know my thoughts.' },
  { reference: 'Psalms 145:18', book: 'Psalms', chapter: 145, verseStart: 18, text: 'The LORD is nigh unto all them that call upon him, to all that call upon him in truth.' },
  { reference: 'Psalms 147:3', book: 'Psalms', chapter: 147, verseStart: 3, text: 'He healeth the broken in heart, and bindeth up their wounds.' },

  // ── Proverbs (additions) ──────────────────────────────────────────
  { reference: 'Proverbs 1:7', book: 'Proverbs', chapter: 1, verseStart: 7, text: 'The fear of the LORD is the beginning of knowledge: but fools despise wisdom and instruction.' },
  { reference: 'Proverbs 4:23', book: 'Proverbs', chapter: 4, verseStart: 23, text: 'Keep thy heart with all diligence; for out of it are the issues of life.' },
  { reference: 'Proverbs 11:25', book: 'Proverbs', chapter: 11, verseStart: 25, text: 'The liberal soul shall be made fat: and he that watereth shall be watered also himself.' },
  { reference: 'Proverbs 15:1', book: 'Proverbs', chapter: 15, verseStart: 1, text: 'A soft answer turneth away wrath: but grievous words stir up anger.' },
  { reference: 'Proverbs 16:9', book: 'Proverbs', chapter: 16, verseStart: 9, text: 'A man\u2019s heart deviseth his way: but the LORD directeth his steps.' },
  { reference: 'Proverbs 17:17', book: 'Proverbs', chapter: 17, verseStart: 17, text: 'A friend loveth at all times, and a brother is born for adversity.' },
  { reference: 'Proverbs 18:21', book: 'Proverbs', chapter: 18, verseStart: 21, text: 'Death and life are in the power of the tongue: and they that love it shall eat the fruit thereof.' },
  { reference: 'Proverbs 19:21', book: 'Proverbs', chapter: 19, verseStart: 21, text: 'There are many devices in a man\u2019s heart; nevertheless the counsel of the LORD, that shall stand.' },
  { reference: 'Proverbs 27:17', book: 'Proverbs', chapter: 27, verseStart: 17, text: 'Iron sharpeneth iron; so a man sharpeneth the countenance of his friend.' },
  { reference: 'Proverbs 31:30', book: 'Proverbs', chapter: 31, verseStart: 30, text: 'Favour is deceitful, and beauty is vain: but a woman that feareth the LORD, she shall be praised.' },

  // ── Ecclesiastes / Song of Solomon ────────────────────────────────
  { reference: 'Ecclesiastes 12:13', book: 'Ecclesiastes', chapter: 12, verseStart: 13, text: 'Let us hear the conclusion of the whole matter: Fear God, and keep his commandments: for this is the whole duty of man.' },
  { reference: 'Song of Solomon 2:4', book: 'Song of Solomon', chapter: 2, verseStart: 4, text: 'He brought me to the banqueting house, and his banner over me was love.' },

  // ── Isaiah (additions) ────────────────────────────────────────────
  { reference: 'Isaiah 1:18', book: 'Isaiah', chapter: 1, verseStart: 18, text: 'Come now, and let us reason together, saith the LORD: though your sins be as scarlet, they shall be as white as snow.' },
  { reference: 'Isaiah 6:8', book: 'Isaiah', chapter: 6, verseStart: 8, text: 'Also I heard the voice of the Lord, saying, Whom shall I send, and who will go for us? Then said I, Here am I; send me.' },
  { reference: 'Isaiah 7:14', book: 'Isaiah', chapter: 7, verseStart: 14, text: 'Therefore the Lord himself shall give you a sign; Behold, a virgin shall conceive, and bear a son, and shall call his name Immanuel.' },
  { reference: 'Isaiah 30:21', book: 'Isaiah', chapter: 30, verseStart: 21, text: 'And thine ears shall hear a word behind thee, saying, This is the way, walk ye in it, when ye turn to the right hand, and when ye turn to the left.' },
  { reference: 'Isaiah 40:8', book: 'Isaiah', chapter: 40, verseStart: 8, text: 'The grass withereth, the flower fadeth: but the word of our God shall stand for ever.' },
  { reference: 'Isaiah 43:2', book: 'Isaiah', chapter: 43, verseStart: 2, text: 'When thou passest through the waters, I will be with thee; and through the rivers, they shall not overflow thee.' },
  { reference: 'Isaiah 53:6', book: 'Isaiah', chapter: 53, verseStart: 6, text: 'All we like sheep have gone astray; we have turned every one to his own way; and the LORD hath laid on him the iniquity of us all.' },
  { reference: 'Isaiah 54:17', book: 'Isaiah', chapter: 54, verseStart: 17, text: 'No weapon that is formed against thee shall prosper; and every tongue that shall rise against thee in judgment thou shalt condemn.' },
  { reference: 'Isaiah 55:11', book: 'Isaiah', chapter: 55, verseStart: 11, text: 'So shall my word be that goeth forth out of my mouth: it shall not return unto me void, but it shall accomplish that which I please.' },
  { reference: 'Isaiah 61:1', book: 'Isaiah', chapter: 61, verseStart: 1, text: 'The Spirit of the Lord GOD is upon me; because the LORD hath anointed me to preach good tidings unto the meek; he hath sent me to bind up the brokenhearted.' },

  // ── Jeremiah / Ezekiel / Daniel ───────────────────────────────────
  { reference: 'Jeremiah 1:5', book: 'Jeremiah', chapter: 1, verseStart: 5, text: 'Before I formed thee in the belly I knew thee; and before thou camest forth out of the womb I sanctified thee.' },
  { reference: 'Jeremiah 17:7', book: 'Jeremiah', chapter: 17, verseStart: 7, text: 'Blessed is the man that trusteth in the LORD, and whose hope the LORD is.' },
  { reference: 'Ezekiel 36:26', book: 'Ezekiel', chapter: 36, verseStart: 26, text: 'A new heart also will I give you, and a new spirit will I put within you: and I will take away the stony heart out of your flesh, and I will give you an heart of flesh.' },
  { reference: 'Daniel 3:17', book: 'Daniel', chapter: 3, verseStart: 17, text: 'If it be so, our God whom we serve is able to deliver us from the burning fiery furnace, and he will deliver us out of thine hand, O king.' },

  // ── Joel / Habakkuk / Zechariah / Malachi ─────────────────────────
  { reference: 'Joel 2:28', book: 'Joel', chapter: 2, verseStart: 28, text: 'And it shall come to pass afterward, that I will pour out my spirit upon all flesh; and your sons and your daughters shall prophesy.' },
  { reference: 'Habakkuk 3:19', book: 'Habakkuk', chapter: 3, verseStart: 19, text: 'The LORD God is my strength, and he will make my feet like hinds\u2019 feet, and he will make me to walk upon mine high places.' },
  { reference: 'Zechariah 4:6', book: 'Zechariah', chapter: 4, verseStart: 6, text: 'Not by might, nor by power, but by my spirit, saith the LORD of hosts.' },
  { reference: 'Malachi 3:10', book: 'Malachi', chapter: 3, verseStart: 10, text: 'Bring ye all the tithes into the storehouse, that there may be meat in mine house, and prove me now herewith, saith the LORD of hosts.' },

  // ── Matthew (additions) ───────────────────────────────────────────
  { reference: 'Matthew 1:23', book: 'Matthew', chapter: 1, verseStart: 23, text: 'Behold, a virgin shall be with child, and shall bring forth a son, and they shall call his name Emmanuel, which being interpreted is, God with us.' },
  { reference: 'Matthew 4:4', book: 'Matthew', chapter: 4, verseStart: 4, text: 'Man shall not live by bread alone, but by every word that proceedeth out of the mouth of God.' },
  { reference: 'Matthew 4:19', book: 'Matthew', chapter: 4, verseStart: 19, text: 'Follow me, and I will make you fishers of men.' },
  { reference: 'Matthew 5:5', book: 'Matthew', chapter: 5, verseStart: 5, text: 'Blessed are the meek: for they shall inherit the earth.' },
  { reference: 'Matthew 5:7', book: 'Matthew', chapter: 5, verseStart: 7, text: 'Blessed are the merciful: for they shall obtain mercy.' },
  { reference: 'Matthew 5:8', book: 'Matthew', chapter: 5, verseStart: 8, text: 'Blessed are the pure in heart: for they shall see God.' },
  { reference: 'Matthew 5:10', book: 'Matthew', chapter: 5, verseStart: 10, text: 'Blessed are they which are persecuted for righteousness\u2019 sake: for theirs is the kingdom of heaven.' },
  { reference: 'Matthew 5:44', book: 'Matthew', chapter: 5, verseStart: 44, text: 'Love your enemies, bless them that curse you, do good to them that hate you, and pray for them which despitefully use you, and persecute you.' },
  { reference: 'Matthew 6:11', book: 'Matthew', chapter: 6, verseStart: 11, text: 'Give us this day our daily bread.' },
  { reference: 'Matthew 6:12', book: 'Matthew', chapter: 6, verseStart: 12, text: 'And forgive us our debts, as we forgive our debtors.' },
  { reference: 'Matthew 6:13', book: 'Matthew', chapter: 6, verseStart: 13, text: 'And lead us not into temptation, but deliver us from evil: For thine is the kingdom, and the power, and the glory, for ever. Amen.' },
  { reference: 'Matthew 6:21', book: 'Matthew', chapter: 6, verseStart: 21, text: 'For where your treasure is, there will your heart be also.' },
  { reference: 'Matthew 6:34', book: 'Matthew', chapter: 6, verseStart: 34, text: 'Take therefore no thought for the morrow: for the morrow shall take thought for the things of itself. Sufficient unto the day is the evil thereof.' },
  { reference: 'Matthew 11:12', book: 'Matthew', chapter: 11, verseStart: 12, text: 'And from the days of John the Baptist until now the kingdom of heaven suffereth violence, and the violent take it by force.' },
  { reference: 'Matthew 11:29', book: 'Matthew', chapter: 11, verseStart: 29, text: 'Take my yoke upon you, and learn of me; for I am meek and lowly in heart: and ye shall find rest unto your souls.' },
  { reference: 'Matthew 16:18', book: 'Matthew', chapter: 16, verseStart: 18, text: 'And I say also unto thee, That thou art Peter, and upon this rock I will build my church; and the gates of hell shall not prevail against it.' },
  { reference: 'Matthew 16:24', book: 'Matthew', chapter: 16, verseStart: 24, text: 'If any man will come after me, let him deny himself, and take up his cross, and follow me.' },
  { reference: 'Matthew 18:20', book: 'Matthew', chapter: 18, verseStart: 20, text: 'For where two or three are gathered together in my name, there am I in the midst of them.' },
  { reference: 'Matthew 19:26', book: 'Matthew', chapter: 19, verseStart: 26, text: 'But Jesus beheld them, and said unto them, With men this is impossible; but with God all things are possible.' },
  { reference: 'Matthew 28:18', book: 'Matthew', chapter: 28, verseStart: 18, text: 'And Jesus came and spake unto them, saying, All power is given unto me in heaven and in earth.' },
  { reference: 'Matthew 28:20', book: 'Matthew', chapter: 28, verseStart: 20, text: 'Teaching them to observe all things whatsoever I have commanded you: and, lo, I am with you alway, even unto the end of the world. Amen.' },

  // ── Mark / Luke (additions) ───────────────────────────────────────
  { reference: 'Mark 8:36', book: 'Mark', chapter: 8, verseStart: 36, text: 'For what shall it profit a man, if he shall gain the whole world, and lose his own soul?' },
  { reference: 'Mark 9:23', book: 'Mark', chapter: 9, verseStart: 23, text: 'Jesus said unto him, If thou canst believe, all things are possible to him that believeth.' },
  { reference: 'Mark 16:15', book: 'Mark', chapter: 16, verseStart: 15, text: 'And he said unto them, Go ye into all the world, and preach the gospel to every creature.' },
  { reference: 'Luke 2:10', book: 'Luke', chapter: 2, verseStart: 10, text: 'And the angel said unto them, Fear not: for, behold, I bring you good tidings of great joy, which shall be to all people.' },
  { reference: 'Luke 2:11', book: 'Luke', chapter: 2, verseStart: 11, text: 'For unto you is born this day in the city of David a Saviour, which is Christ the Lord.' },
  { reference: 'Luke 2:14', book: 'Luke', chapter: 2, verseStart: 14, text: 'Glory to God in the highest, and on earth peace, good will toward men.' },
  { reference: 'Luke 9:23', book: 'Luke', chapter: 9, verseStart: 23, text: 'And he said to them all, If any man will come after me, let him deny himself, and take up his cross daily, and follow me.' },
  { reference: 'Luke 12:34', book: 'Luke', chapter: 12, verseStart: 34, text: 'For where your treasure is, there will your heart be also.' },
  { reference: 'Luke 19:10', book: 'Luke', chapter: 19, verseStart: 10, text: 'For the Son of man is come to seek and to save that which was lost.' },

  // ── John (additions) ──────────────────────────────────────────────
  { reference: 'John 1:12', book: 'John', chapter: 1, verseStart: 12, text: 'But as many as received him, to them gave he power to become the sons of God, even to them that believe on his name.' },
  { reference: 'John 1:29', book: 'John', chapter: 1, verseStart: 29, text: 'Behold the Lamb of God, which taketh away the sin of the world.' },
  { reference: 'John 4:24', book: 'John', chapter: 4, verseStart: 24, text: 'God is a Spirit: and they that worship him must worship him in spirit and in truth.' },
  { reference: 'John 6:35', book: 'John', chapter: 6, verseStart: 35, text: 'And Jesus said unto them, I am the bread of life: he that cometh to me shall never hunger; and he that believeth on me shall never thirst.' },
  { reference: 'John 8:12', book: 'John', chapter: 8, verseStart: 12, text: 'I am the light of the world: he that followeth me shall not walk in darkness, but shall have the light of life.' },
  { reference: 'John 11:25', book: 'John', chapter: 11, verseStart: 25, text: 'I am the resurrection, and the life: he that believeth in me, though he were dead, yet shall he live.' },
  { reference: 'John 13:34', book: 'John', chapter: 13, verseStart: 34, text: 'A new commandment I give unto you, That ye love one another; as I have loved you, that ye also love one another.' },
  { reference: 'John 14:2', book: 'John', chapter: 14, verseStart: 2, text: 'In my Father\u2019s house are many mansions: if it were not so, I would have told you. I go to prepare a place for you.' },
  { reference: 'John 14:13', book: 'John', chapter: 14, verseStart: 13, text: 'And whatsoever ye shall ask in my name, that will I do, that the Father may be glorified in the Son.' },
  { reference: 'John 14:26', book: 'John', chapter: 14, verseStart: 26, text: 'But the Comforter, which is the Holy Ghost, whom the Father will send in my name, he shall teach you all things.' },
  { reference: 'John 15:7', book: 'John', chapter: 15, verseStart: 7, text: 'If ye abide in me, and my words abide in you, ye shall ask what ye will, and it shall be done unto you.' },
  { reference: 'John 17:3', book: 'John', chapter: 17, verseStart: 3, text: 'And this is life eternal, that they might know thee the only true God, and Jesus Christ, whom thou hast sent.' },
  { reference: 'John 20:29', book: 'John', chapter: 20, verseStart: 29, text: 'Jesus saith unto him, Thomas, because thou hast seen me, thou hast believed: blessed are they that have not seen, and yet have believed.' },

  // ── Acts (additions) ──────────────────────────────────────────────
  { reference: 'Acts 17:28', book: 'Acts', chapter: 17, verseStart: 28, text: 'For in him we live, and move, and have our being.' },
  { reference: 'Acts 20:35', book: 'Acts', chapter: 20, verseStart: 35, text: 'Remember the words of the Lord Jesus, how he said, It is more blessed to give than to receive.' },

  // ── Romans (additions) ────────────────────────────────────────────
  { reference: 'Romans 5:1', book: 'Romans', chapter: 5, verseStart: 1, text: 'Therefore being justified by faith, we have peace with God through our Lord Jesus Christ.' },
  { reference: 'Romans 8:18', book: 'Romans', chapter: 8, verseStart: 18, text: 'For I reckon that the sufferings of this present time are not worthy to be compared with the glory which shall be revealed in us.' },
  { reference: 'Romans 8:39', book: 'Romans', chapter: 8, verseStart: 39, text: 'Nor height, nor depth, nor any other creature, shall be able to separate us from the love of God, which is in Christ Jesus our Lord.' },
  { reference: 'Romans 10:13', book: 'Romans', chapter: 10, verseStart: 13, text: 'For whosoever shall call upon the name of the Lord shall be saved.' },
  { reference: 'Romans 10:17', book: 'Romans', chapter: 10, verseStart: 17, text: 'So then faith cometh by hearing, and hearing by the word of God.' },
  { reference: 'Romans 12:12', book: 'Romans', chapter: 12, verseStart: 12, text: 'Rejoicing in hope; patient in tribulation; continuing instant in prayer.' },
  { reference: 'Romans 12:18', book: 'Romans', chapter: 12, verseStart: 18, text: 'If it be possible, as much as lieth in you, live peaceably with all men.' },
  { reference: 'Romans 12:21', book: 'Romans', chapter: 12, verseStart: 21, text: 'Be not overcome of evil, but overcome evil with good.' },
  { reference: 'Romans 14:8', book: 'Romans', chapter: 14, verseStart: 8, text: 'For whether we live, we live unto the Lord; and whether we die, we die unto the Lord: whether we live therefore, or die, we are the Lord\u2019s.' },
  { reference: 'Romans 15:13', book: 'Romans', chapter: 15, verseStart: 13, text: 'Now the God of hope fill you with all joy and peace in believing, that ye may abound in hope, through the power of the Holy Ghost.' },

  // ── 1 Corinthians (additions) ─────────────────────────────────────
  { reference: '1 Corinthians 2:9', book: '1 Corinthians', chapter: 2, verseStart: 9, text: 'Eye hath not seen, nor ear heard, neither have entered into the heart of man, the things which God hath prepared for them that love him.' },
  { reference: '1 Corinthians 6:19', book: '1 Corinthians', chapter: 6, verseStart: 19, text: 'What? know ye not that your body is the temple of the Holy Ghost which is in you, which ye have of God, and ye are not your own?' },
  { reference: '1 Corinthians 13:7', book: '1 Corinthians', chapter: 13, verseStart: 7, text: 'Beareth all things, believeth all things, hopeth all things, endureth all things.' },
  { reference: '1 Corinthians 13:8', book: '1 Corinthians', chapter: 13, verseStart: 8, text: 'Charity never faileth: but whether there be prophecies, they shall fail; whether there be tongues, they shall cease; whether there be knowledge, it shall vanish away.' },
  { reference: '1 Corinthians 16:14', book: '1 Corinthians', chapter: 16, verseStart: 14, text: 'Let all your things be done with charity.' },

  // ── 2 Corinthians / Galatians / Ephesians (additions) ────────────
  { reference: '2 Corinthians 4:17', book: '2 Corinthians', chapter: 4, verseStart: 17, text: 'For our light affliction, which is but for a moment, worketh for us a far more exceeding and eternal weight of glory.' },
  { reference: '2 Corinthians 5:7', book: '2 Corinthians', chapter: 5, verseStart: 7, text: 'For we walk by faith, not by sight.' },
  { reference: '2 Corinthians 9:7', book: '2 Corinthians', chapter: 9, verseStart: 7, text: 'Every man according as he purposeth in his heart, so let him give; not grudgingly, or of necessity: for God loveth a cheerful giver.' },
  { reference: 'Galatians 3:28', book: 'Galatians', chapter: 3, verseStart: 28, text: 'There is neither Jew nor Greek, there is neither bond nor free, there is neither male nor female: for ye are all one in Christ Jesus.' },
  { reference: 'Galatians 5:13', book: 'Galatians', chapter: 5, verseStart: 13, text: 'For, brethren, ye have been called unto liberty; only use not liberty for an occasion to the flesh, but by love serve one another.' },
  { reference: 'Galatians 5:23', book: 'Galatians', chapter: 5, verseStart: 23, text: 'Meekness, temperance: against such there is no law.' },
  { reference: 'Ephesians 2:9', book: 'Ephesians', chapter: 2, verseStart: 9, text: 'Not of works, lest any man should boast.' },
  { reference: 'Ephesians 3:20', book: 'Ephesians', chapter: 3, verseStart: 20, text: 'Now unto him that is able to do exceeding abundantly above all that we ask or think, according to the power that worketh in us.' },
  { reference: 'Ephesians 4:2', book: 'Ephesians', chapter: 4, verseStart: 2, text: 'With all lowliness and meekness, with longsuffering, forbearing one another in love.' },
  { reference: 'Ephesians 5:1', book: 'Ephesians', chapter: 5, verseStart: 1, text: 'Be ye therefore followers of God, as dear children.' },
  { reference: 'Ephesians 5:25', book: 'Ephesians', chapter: 5, verseStart: 25, text: 'Husbands, love your wives, even as Christ also loved the church, and gave himself for it.' },

  // ── Philippians / Colossians (additions) ──────────────────────────
  { reference: 'Philippians 1:21', book: 'Philippians', chapter: 1, verseStart: 21, text: 'For to me to live is Christ, and to die is gain.' },
  { reference: 'Philippians 2:3', book: 'Philippians', chapter: 2, verseStart: 3, text: 'Let nothing be done through strife or vainglory; but in lowliness of mind let each esteem other better than themselves.' },
  { reference: 'Philippians 2:10', book: 'Philippians', chapter: 2, verseStart: 10, text: 'That at the name of Jesus every knee should bow, of things in heaven, and things in earth, and things under the earth.' },
  { reference: 'Philippians 4:8', book: 'Philippians', chapter: 4, verseStart: 8, text: 'Whatsoever things are true, whatsoever things are honest, whatsoever things are just, whatsoever things are pure, whatsoever things are lovely, whatsoever things are of good report; if there be any virtue, and if there be any praise, think on these things.' },
  { reference: 'Colossians 3:1', book: 'Colossians', chapter: 3, verseStart: 1, text: 'If ye then be risen with Christ, seek those things which are above, where Christ sitteth on the right hand of God.' },
  { reference: 'Colossians 3:13', book: 'Colossians', chapter: 3, verseStart: 13, text: 'Forbearing one another, and forgiving one another, if any man have a quarrel against any: even as Christ forgave you, so also do ye.' },

  // ── 1 Thess / 2 Thess / 1 Timothy / 2 Timothy / Titus ────────────
  { reference: '1 Thessalonians 4:16', book: '1 Thessalonians', chapter: 4, verseStart: 16, text: 'For the Lord himself shall descend from heaven with a shout, with the voice of the archangel, and with the trump of God: and the dead in Christ shall rise first.' },
  { reference: '2 Thessalonians 3:3', book: '2 Thessalonians', chapter: 3, verseStart: 3, text: 'But the Lord is faithful, who shall stablish you, and keep you from evil.' },
  { reference: '1 Timothy 4:12', book: '1 Timothy', chapter: 4, verseStart: 12, text: 'Let no man despise thy youth; but be thou an example of the believers, in word, in conversation, in charity, in spirit, in faith, in purity.' },
  { reference: '1 Timothy 6:6', book: '1 Timothy', chapter: 6, verseStart: 6, text: 'But godliness with contentment is great gain.' },
  { reference: '1 Timothy 6:10', book: '1 Timothy', chapter: 6, verseStart: 10, text: 'For the love of money is the root of all evil: which while some coveted after, they have erred from the faith, and pierced themselves through with many sorrows.' },
  { reference: '2 Timothy 2:15', book: '2 Timothy', chapter: 2, verseStart: 15, text: 'Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.' },
  { reference: '2 Timothy 4:7', book: '2 Timothy', chapter: 4, verseStart: 7, text: 'I have fought a good fight, I have finished my course, I have kept the faith.' },
  { reference: 'Titus 3:5', book: 'Titus', chapter: 3, verseStart: 5, text: 'Not by works of righteousness which we have done, but according to his mercy he saved us, by the washing of regeneration, and renewing of the Holy Ghost.' },

  // ── Hebrews / James (additions) ───────────────────────────────────
  { reference: 'Hebrews 1:3', book: 'Hebrews', chapter: 1, verseStart: 3, text: 'Who being the brightness of his glory, and the express image of his person, and upholding all things by the word of his power.' },
  { reference: 'Hebrews 4:16', book: 'Hebrews', chapter: 4, verseStart: 16, text: 'Let us therefore come boldly unto the throne of grace, that we may obtain mercy, and find grace to help in time of need.' },
  { reference: 'Hebrews 10:24', book: 'Hebrews', chapter: 10, verseStart: 24, text: 'And let us consider one another to provoke unto love and to good works.' },
  { reference: 'Hebrews 10:25', book: 'Hebrews', chapter: 10, verseStart: 25, text: 'Not forsaking the assembling of ourselves together, as the manner of some is; but exhorting one another: and so much the more, as ye see the day approaching.' },
  { reference: 'Hebrews 12:11', book: 'Hebrews', chapter: 12, verseStart: 11, text: 'Now no chastening for the present seemeth to be joyous, but grievous: nevertheless afterward it yieldeth the peaceable fruit of righteousness unto them which are exercised thereby.' },
  { reference: 'James 1:12', book: 'James', chapter: 1, verseStart: 12, text: 'Blessed is the man that endureth temptation: for when he is tried, he shall receive the crown of life.' },
  { reference: 'James 1:17', book: 'James', chapter: 1, verseStart: 17, text: 'Every good gift and every perfect gift is from above, and cometh down from the Father of lights, with whom is no variableness, neither shadow of turning.' },
  { reference: 'James 1:22', book: 'James', chapter: 1, verseStart: 22, text: 'But be ye doers of the word, and not hearers only, deceiving your own selves.' },
  { reference: 'James 2:17', book: 'James', chapter: 2, verseStart: 17, text: 'Even so faith, if it hath not works, is dead, being alone.' },

  // ── 1 Peter / 2 Peter / 1-3 John / Jude ──────────────────────────
  { reference: '1 Peter 1:3', book: '1 Peter', chapter: 1, verseStart: 3, text: 'Blessed be the God and Father of our Lord Jesus Christ, which according to his abundant mercy hath begotten us again unto a lively hope by the resurrection of Jesus Christ from the dead.' },
  { reference: '1 Peter 3:15', book: '1 Peter', chapter: 3, verseStart: 15, text: 'But sanctify the Lord God in your hearts: and be ready always to give an answer to every man that asketh you a reason of the hope that is in you with meekness and fear.' },
  { reference: '1 Peter 4:8', book: '1 Peter', chapter: 4, verseStart: 8, text: 'And above all things have fervent charity among yourselves: for charity shall cover the multitude of sins.' },
  { reference: '1 Peter 5:8', book: '1 Peter', chapter: 5, verseStart: 8, text: 'Be sober, be vigilant; because your adversary the devil, as a roaring lion, walketh about, seeking whom he may devour.' },
  { reference: '2 Peter 3:9', book: '2 Peter', chapter: 3, verseStart: 9, text: 'The Lord is not slack concerning his promise, as some men count slackness; but is longsuffering to us-ward, not willing that any should perish, but that all should come to repentance.' },
  { reference: '1 John 3:1', book: '1 John', chapter: 3, verseStart: 1, text: 'Behold, what manner of love the Father hath bestowed upon us, that we should be called the sons of God.' },
  { reference: '1 John 3:16', book: '1 John', chapter: 3, verseStart: 16, text: 'Hereby perceive we the love of God, because he laid down his life for us: and we ought to lay down our lives for the brethren.' },
  { reference: '1 John 5:14', book: '1 John', chapter: 5, verseStart: 14, text: 'And this is the confidence that we have in him, that, if we ask any thing according to his will, he heareth us.' },
  { reference: 'Jude 1:24', book: 'Jude', chapter: 1, verseStart: 24, text: 'Now unto him that is able to keep you from falling, and to present you faultless before the presence of his glory with exceeding joy.' },

  // ── Revelation (additions) ────────────────────────────────────────
  { reference: 'Revelation 1:8', book: 'Revelation', chapter: 1, verseStart: 8, text: 'I am Alpha and Omega, the beginning and the ending, saith the Lord, which is, and which was, and which is to come, the Almighty.' },
  { reference: 'Revelation 4:11', book: 'Revelation', chapter: 4, verseStart: 11, text: 'Thou art worthy, O Lord, to receive glory and honour and power: for thou hast created all things, and for thy pleasure they are and were created.' },
  { reference: 'Revelation 5:12', book: 'Revelation', chapter: 5, verseStart: 12, text: 'Worthy is the Lamb that was slain to receive power, and riches, and wisdom, and strength, and honour, and glory, and blessing.' },
  { reference: 'Revelation 19:6', book: 'Revelation', chapter: 19, verseStart: 6, text: 'Alleluia: for the Lord God omnipotent reigneth.' },
  { reference: 'Revelation 21:5', book: 'Revelation', chapter: 21, verseStart: 5, text: 'And he that sat upon the throne said, Behold, I make all things new.' },
  { reference: 'Revelation 22:20', book: 'Revelation', chapter: 22, verseStart: 20, text: 'He which testifieth these things saith, Surely I come quickly. Amen. Even so, come, Lord Jesus.' },
] as const

export const POPULAR_VERSES_COUNT = POPULAR_VERSES_KJV.length

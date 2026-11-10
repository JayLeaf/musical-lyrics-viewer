/* 배역 → 파트(공/남/여) 기본표. 이름은 대소문자·악센트·구두점 무시하고 비교한다.
   여기 없는 이름은 앱의 '배역 성별 지정' 화면에서 직접 고를 수 있다. */
(function () {
  'use strict';
  var M = '남', F = '여', C = '공';
  window.LPCast = {
    // Epic
    'Odysseus': M, 'Penelope': F, 'Athena': F, 'Poseidon': M, 'Zeus': M, 'Hermes': M,
    'Circe': F, 'Calypso': F, 'Polites': M, 'Eurylochus': M, 'Telemachus': M, 'Antinous': M,
    'Aeolus': M, 'Tiresias': M, 'Anticlea': F, 'Polyphemus': M, 'Cyclops': M, 'Scylla': F,
    'Apollo': M, 'Ares': M, 'Hera': F, 'Aphrodite': F, 'Elpenor': M, 'Perimedes': M,
    'Charybdis': C, 'Sirens': C, 'Lotus Eaters': C, 'Suitors': C, 'Crew': C, 'Winds': C,
    'Soldier': M, 'Cyclopes': C, 'Winions': C, 'Laestrygonians': C, 'Siren': F, 'Hephaestus': M,
    'Suitor': M, 'Eurymachus': M, 'Amphinomus': M, 'Melanthius': M,
    // Hamilton
    'Hamilton': M, 'Alexander Hamilton': M, 'Burr': M, 'Aaron Burr': M, 'Laurens': M, 'John Laurens': M,
    'Lafayette': M, 'Mulligan': M, 'Hercules Mulligan': M, 'Washington': M, 'George Washington': M,
    'Jefferson': M, 'Thomas Jefferson': M, 'Madison': M, 'James Madison': M, 'King George': M,
    'King George III': M, 'Philip': M, 'Philip Hamilton': M, 'Eacker': M, 'George Eacker': M,
    'Seabury': M, 'Samuel Seabury': M, 'Charles Lee': M, 'Lee': M, 'James Reynolds': M, 'Doctor': M,
    'Eliza': F, 'Eliza Hamilton': F, 'Angelica': F, 'Angelica Schuyler': F, 'Peggy': F,
    'Maria': F, 'Maria Reynolds': F, 'Martha Washington': F, 'Schuyler Sisters': C, 'Sisters': C,
    'Recorded Samples': C,
    // Sweeney Todd
    'Sweeney': M, 'Todd': M, 'Sweeney Todd': M, 'Mrs Lovett': F, 'Lovett': F, 'Anthony': M,
    'Johanna': F, 'Judge Turpin': M, 'Judge': M, 'Turpin': M, 'Beadle': M, 'Beadle Bamford': M,
    'Bamford': M, 'Pirelli': M, 'Tobias': M, 'Toby': M, 'Beggar Woman': F, 'Fogg': M,
    // Hadestown
    'Orpheus': M, 'Eurydice': F, 'Persephone': F, 'Hades': M, 'Fates': C, 'Workers': C,
    // Roméo & Juliette
    'Romeo': M, 'Juliette': F, 'Juliet': F, 'Mercutio': M, 'Benvolio': M, 'Tybalt': M,
    'Lady Capulet': F, 'Lady Montaigu': F, 'Lady Montague': F, 'Nourrice': F, 'La Nourrice': F,
    'Nurse': F, 'Frere Laurent': M, 'Prince': M, 'Le Prince': M, 'Capulet': M, 'Comte Capulet': M,
    'Montaigu': M, 'Paris': M, 'Comte Paris': M, 'Poete': M, 'Le Poete': M, 'Mort': F, 'La Mort': F,
    // Les Dix Commandements
    'Moise': M, 'Ramses': M, 'Nefertari': F, 'Sephora': F, 'Myriam': F, 'Bithia': F, 'Yokebed': F,
    'Aaron': M, 'Josue': M, 'Pharaon': M, 'Le Pharaon': M, 'Sethi': M, 'Seti': M, 'Amenophis': M,
    // 기타
    'Aida': F, 'Radames': M, 'Amneris': F,
    'Lizzie': F, 'Lizzie Borden': F, 'Emma': F, 'Emma Borden': F, 'Bridget': F, 'Alice': F,
    '리지': F, '엠마': F, '앨리스': F, '브리짓': F,
    '빅터': M, '빅터 프랑켄슈타인': M, '앙리': M, '앙리 뒤프레': M, '괴물': M, '줄리아': F, '엘렌': F, '까뜨린느': F,
    '몬테크리스토': M, '에드몽': M, '에드몽 단테스': M, '메르세데스': F, '몬데고': M, '빌포트': M, '당글라스': M
  };
})();

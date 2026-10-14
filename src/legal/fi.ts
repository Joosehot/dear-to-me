// The legal pages in Finnish, the main language. Drafts for a lawyer: plain and true to what the app does.

import { FIGURES as F, OPERATOR as O, euros, gigas, percent, type LegalTexts } from './common';

const e = (cents: number) => euros(cents, 'fi');
const pct = (x: number) => percent(x, 'fi');
const gt = (b: number) => gigas(b, 'fi');
const L = F.lite;
const hours = (ms: number) => ms / (60 * 60 * 1000);
const ex = F.example;

export const fi: LegalTexts = {
  draft: 'Luonnos: tarkistettava juristilla ennen julkaisua',
  effective: `Voimassa ${O.effective} alkaen`,
  back: 'Takaisin',
  labels: {
    terms: 'Käyttöehdot',
    privacy: 'Tietosuoja',
    refunds: 'Peruutus ja palautukset',
    rules: 'Sisältösäännöt',
    contact: 'Yhteystiedot',
  },
  docs: {
    // ---------------- käyttöehdot ----------------
    terms: {
      title: 'Käyttöehdot',
      lead: 'Nämä ehdot ovat sopimus sinun ja Dear to Me -palvelun ylläpitäjän välillä. Ne koskevat palvelun käyttöä, julkaisemista, ostamista ja myymistä. Jos suomen- ja englanninkielinen versio eroavat, suomenkielinen on ratkaiseva.',
      sections: [
        {
          title: '1. Palveluntarjoaja',
          body: [
            `Dear to Me -palvelua (jäljempänä D2M tai me) ylläpitää ${O.name} (Y-tunnus ${O.businessId}), ${O.address}, Suomi. Sähköposti: ${O.email}. Kaikki yhteystiedot ovat Yhteystiedot-sivulla.`,
          ],
        },
        {
          title: '2. Mikä D2M on',
          body: [
            'D2M on sosiaalinen palvelu omille ystävillesi. Palvelussa voit:',
            [
              'kirjoittaa pitkiä blogeja ja julkaista vlogeja (videoita);',
              'keskustella reaaliajassa jokaisen julkaisun alla;',
              'kirjoittaa kirjeen, eli julkaisun yhdelle ystävälle;',
              'jättää julkaisuun BoVNoten, eli piilotetun viestin valitsemillesi lukijoille;',
              'julkaista julkisesti, jolloin julkaisu voi näkyä kaikille käyttäjille For You -sivulla;',
              'tehdä itsellesi julkisen profiilin;',
              'perustaa ryhmiä ja kirjoittaa niihin: yksityisiä kaveriryhmiä ja avoimia kiinnostusryhmiä;',
              'maksullisilla tilauksilla myydä julkaisujasi lukijoille.',
            ],
            'Valitset jokaiselle julkaisulle, kuka sen näkee: ystäväsi, valitsemasi lukijat tai kaikki (julkinen). Kirjeen näkee vain se ystävä, jolle kirjoitit.',
            'Julkinen julkaisu ja julkinen profiili näkyvät kenelle tahansa, myös ihmisille, joilla ei ole tiliä, ja hakukoneet voivat löytää ne. Maksullisesta julkaisusta näkyy ilman tilausta tai ostoa vain sen alku. Julkisen julkaisun keskustelu on julkinen samoin: kuka tahansa voi lukea sen viestit ja niiden kirjoittajien nimet ja profiilikuvat, mutta kirjoittaa siihen voi vain kirjautunut käyttäjä.',
            'Kaveriryhmä on yksityinen: sen, sen jäsenet ja sen julkaisut keskusteluineen näkevät vain sen jäsenet. Ryhmään liitytään vain hyväksymällä kutsu, ja kutsua voi vain omia ystäviään (jäsenen kutsuehdotuksen hyväksyy ylläpitäjä). Kiinnostusryhmä on avoin: sen ja sen julkaisut keskusteluineen näkevät kaikki kirjautuneet käyttäjät, ja kuka tahansa kirjautunut voi liittyä siihen. Ryhmät ja niiden julkaisut eivät koskaan näy ilman tiliä eivätkä hakukoneissa, eivätkä ne ole julkisia julkaisuja: niillä ei ole aiheita, ne eivät näy For You -sivulla, eivätkä ne voi olla maksullisia. Ryhmästä poistuva tai poistettu jäsen ei enää näe kaveriryhmän julkaisuja; uusi jäsen näkee myös aiemmat.',
            'D2M:ssä ei ole mainoksia, analytiikkaa eikä seurantaa.',
          ],
        },
        {
          title: '3. Tili',
          body: [
            'Tilin luomiseen tarvitset näyttönimen, käyttäjänimen, sähköpostiosoitteen ja salasanan. Tili on henkilökohtainen: älä anna salasanaasi muille. Vastaat siitä, mitä tililläsi tehdään, ellei joku ole päässyt tilillesi sinusta riippumatta.',
            `Palvelun käyttäjän on oltava vähintään [ikäraja] vuotta vanha. Alaikäinen tarvitsee huoltajan luvan maksullisiin ostoihin.`,
            'Näyttönimesi, käyttäjänimesi (@käyttäjänimi) ja profiilikuvasi näkyvät muille käyttäjille, esimerkiksi haussa ja ystävälistoilla. Käyttäjänimi on yksilöllinen; jos vaihdat sen, vanha pysyy 30 päivää varattuna sinulle, eikä kukaan muu voi ottaa sitä sinä aikana.',
            'Voit lopettaa palvelun käytön milloin tahansa ja poistaa tilisi itse Oma paikka -sivulla (Poista tili) salasanallasi. Silloin kaikki kuukausimaksusi päättyvät heti, myös lukijoidesi kuukausitilaukset sinulle, ja tilisi, profiilisi, julkaisusi tiedostoineen, viestisi kaikissa keskusteluissa, BoVNotesi, ystävyytesi, tilauksesi ja ilmoituksesi poistetaan. Ostoista säilytetään kirjanpitoa varten vain Stripen tunnisteet, summat ja ajat, ilman tietoa siitä, kenen ne olivat. Jo ansaitsemasi tulot maksetaan edelleen Stripe-tilillesi Stripen kautta.',
            `Tilin poistaminen ei hyvitä jo maksettua kautta eikä vapauta jo syntyneistä maksuista. Jos haluat peruuttaa viimeisen ${F.withdrawalDays} päivän aikana tehdyn kuukausisopimuksen ja saada käyttämättömän osuuden takaisin, tee se Peruuta sopimus -toiminnolla ennen tilin poistamista. Jos poistat tilin, myymäsi julkaisut poistuvat, ja niiden viimeisen ${F.refundDays} päivän aikana tehdyt ostot palautetaan ostajille (katso kohta 10).`,
          ],
        },
        {
          title: '4. Sisältö ja sen säännöt',
          body: [
            'Palvelussa on kielletty:',
            [
              'seksuaalinen sisältö missään muodossa, myös yksityisissä julkaisuissa, kirjeissä ja BoVNoteissa: pornografia, seksuaalisesti avoimet tai vihjailevat kuvat, videot ja tekstit sekä seksipalvelujen tarjoaminen. Omasta intiimistä elämästä, kuten parisuhteesta, tunteista, terveydestä tai kehosta, saa kirjoittaa (katso Sisältösäännöt);',
              'tekoälyllä tehty sisältö missään muodossa, myös yksityisissä julkaisuissa ja kirjeissä: kokonaan tai pääosin generatiivisella tekoälyllä tehty teksti, kuva, video tai ääni, ja aina oikeista ihmisistä tehdyt syväväärennökset (deepfaket);',
              'laiton sisältö, esimerkiksi toisen tekijänoikeutta loukkaava aineisto, kunnianloukkaus, laiton uhkaus, kiihottaminen kansanryhmää vastaan ja yksityiselämää loukkaavan tiedon levittäminen;',
              'häirintä, kiusaaminen ja toisen ihmisen uhkailu.',
            ],
            'Kun julkaiset julkisesti, vahvistat, että julkaisu on omaa työtäsi eikä tekoälyllä tehty, eikä siinä ole seksuaalista sisältöä. Tarkemmat säännöt ovat Sisältösäännöt-sivulla, ja ne ovat osa näitä ehtoja.',
            'Samat säännöt koskevat ryhmiä. Kiinnostusryhmään kirjoittaessasi vahvistat samoin, että julkaisu on omaa työtäsi eikä tekoälyllä tehty, eikä siinä ole seksuaalista sisältöä. Ryhmän perustaja on sen ylläpitäjä. Ylläpitäjä voi kutsua jäseniä, poistaa jäseniä ryhmästä, nimittää toisia ylläpitäjiksi, muuttaa ryhmän nimeä ja kuvausta, poistaa julkaisuja ryhmästä ja poistaa koko ryhmän julkaisuineen; kiinnostusryhmän ylläpitäjä voi myös estää käyttäjää liittymästä ryhmään ja keskustelemasta siinä. Ylläpitäjät ovat käyttäjiä, eivät D2M:n moderaattoreita: heidän päätöksistään ei lähetetä perusteluja, mutta ryhmän julkaisuista voi ilmoittaa kuten muistakin, ja D2M:n moderointi koskee niitä samoin (kohta 5). Viimeinen ylläpitäjä nimeää poistuessaan seuraajan tai poistaa ryhmän; jos hän poistaa tilinsä, kaveriryhmä poistetaan julkaisuineen ja kiinnostusryhmän ylläpito siirtyy sen pisimpään jäsenenä olleelle.',
            'Vastaat itse julkaisemastasi sisällöstä. Emme tarkista sisältöä etukäteen, eikä meillä ole automaattista tekoälysisällön tunnistusta: sääntöjä valvotaan kirjoittajien vahvistuksella ja ilmoituksilla.',
          ],
        },
        {
          title: '5. Ilmoittaminen ja poistaminen',
          body: [
            'Kirjautunut käyttäjä voi ilmoittaa julkaisusta sen Ilmoita-painikkeella syyllä seksuaalinen sisältö, tekoälyllä tehty sisältö tai muu syy. Kun kolme eri käyttäjää on ilmoittanut samasta julkaisusta, se poistuu For You -sivulta automaattisesti siihen asti, kunnes moderaattori on käsitellyt sen. Tämä on palvelun ainoa automaattinen toimi.',
            `Kuka tahansa, myös ilman tiliä, voi ilmoittaa laittomasta tai sääntöjen vastaisesta sisällöstä {ilmoituslomakkeella|/report-content}: sisällön osoite, mitä sääntöä se rikkoo ja miksi, sähköpostiosoitteesi ja vakuutus siitä, että tiedot ovat oikeita. Saat vahvistuksen sähköpostiisi. Voit ilmoittaa myös sähköpostitse osoitteeseen ${O.email}. Lapsen seksuaalista hyväksikäyttöä esittävästä aineistosta ei tarvitse kertoa nimeä.`,
            'Ilmoitukset käsittelee ihminen, palvelun moderaattori, viipymättä. Moderaattori näkee ilmoitetun julkaisun kokonaan, myös jos se on kirjoitettu vain ystäville. Hän voi jättää julkaisun (ilmoitukset poistetaan, ja se palaa For You -sivulle), poistaa sen (sisältö ja tiedostot poistetaan), rajoittaa sitä (vain sinä näet sen, kunnes moderaattori poistaa rajoituksen) tai jäädyttää tilin (kohta 11). Jokaisella päätöksellä on kirjoitettu perustelu.',
            'Kun julkaisusi poistetaan tai sitä rajoitetaan tai tilisi jäädytetään, saat sähköpostiisi päätöksen perustelut: mitä päätettiin, mitä sääntöä rikottiin, mihin tosiasioihin päätös perustuu (esimerkiksi ilmoitusten määrä ja syyt), että päätöksen teki ihminen, ja miten voit valittaa. Ilmoituksen tekijälle kerromme sähköpostitse, mitä ilmoitukselle tehtiin, kertomatta julkaisun tekijän tietoja.',
            `Voit valittaa sinua koskevasta päätöksestä ${F.complaintMonths} kuukauden ajan päätöksestä: perusteluviestin linkistä, joka toimii kerran myös kirjautumatta, tai kirjautuneena päätöksen sivulla. Valituksen käsittelee ihminen, joka voi tehdä toisen päätöksen, ja kerromme ratkaisun sähköpostitse. Poistetun julkaisun sisältöä ei voi palauttaa, vaikka päätös peruttaisiin, koska se on poistettu; voit julkaista sen uudelleen. Ilmoituksen tekijä voi pyytää päätöksen uudelleenarviointia kirjoittamalla meille. Voit myös viedä asian digipalvelusäädöksen mukaiselle tuomioistuimen ulkopuoliselle riidanratkaisuelimelle tai tuomioistuimeen.`,
            'Jos sisältö viittaa rikokseen, joka uhkaa jonkun henkeä tai turvallisuutta, ilmoitamme siitä viranomaisille. Lapsia seksualisoivasta sisällöstä ilmoitamme aina poliisille.',
          ],
        },
        {
          title: '6. Oikeutesi sisältöösi',
          body: [
            'Sisältö, jonka julkaiset, on sinun. Emme omista sitä emmekä myy sitä eteenpäin.',
            'Annat meille maksuttoman ja ei-yksinomaisen luvan säilyttää, kopioida ja käsitellä teknisesti (esimerkiksi tehdä videosta pienemmän katselukopion) sekä näyttää sisältöäsi, mutta vain siinä määrin kuin tarvitaan, jotta voimme näyttää sen niille lukijoille, jotka olet valinnut. Emme käytä sisältöäsi mainontaan tai muuhun tarkoitukseen.',
            'Lupa päättyy, kun julkaisu poistetaan, joko sinä poistat sen tai sen aika umpeutuu. Teknisistä syistä poistettu tieto voi säilyä varmuuskopioissa enintään [varmuuskopioiden säilytysaika], minkä jälkeen se poistuu niistäkin.',
            'Julkaise vain sisältöä, johon sinulla on oikeus. Jos julkaisussa näkyy muita ihmisiä, varmista, että he hyväksyvät sen.',
          ],
        },
        {
          title: '7. Tilaukset',
          body: [
            'Palvelussa on kolme tilausta. Hinnat sisältävät arvonlisäveron (Suomen ALV ' + pct(F.vat) + ').',
            [
              `Lite on maksuton. Julkaisut katoavat: blogi ${hours(L.blogLife)} tunnin kuluttua (enintään ${L.blogsPer24h} vuorokaudessa), vlogi ${hours(L.vlogLife) / 24} päivän kuluttua (${L.vlogsPer24h} vuorokaudessa, enintään ${L.vlogMaxSeconds / 60} minuuttia) ja kirje viikon kuluttua. Tallennustilaa on ${gt(F.storage.lite.video)} videoille ja ${gt(F.storage.lite.media)} tekstille ja kuville.`,
              `Unlimited maksaa ${e(F.unlimitedPrice)} kuukaudessa. Valitset itse, kuinka kauan kukin julkaisu on esillä, ja julkaisut, joiden aika on umpeutunut, siirtyvät arkistoosi. Tallennustilaa on ${gt(F.storage.unlimited.video)} videoille ja ${gt(F.storage.unlimited.media)} tekstille ja kuville, ja voit ostaa lisää. Voit myydä lukijoille kuukausitilausta maksullisiin julkisiin julkaisuihisi (enintään ${e(F.maxSubscription)} kuukaudessa).`,
              `Exclusive maksaa ${e(F.exclusivePrice)} kuukaudessa. Siinä on kaikki Unlimitedin ominaisuudet, mutta kuukausitilauksen sijaan myyt julkaisuja yksitellen: blogin enintään ${e(F.post.blogMax)} ja vlogin enintään ${e(F.post.vlogMax)}; myytävän vlogin on oltava vähintään ${F.post.vlogMinSeconds / 60} minuuttia pitkä. Lukijat eivät maksa kuukausimaksua. Tallennustilaa on ${gt(F.storage.exclusive.video)} videoille ja ${gt(F.storage.exclusive.media)} tekstille ja kuville.`,
            ],
            `Maksullisiin tilauksiin voit ostaa lisätallennustilaa kuukausittaisina paketteina: ${gt(F.packs.video.bytes)} videoille ${e(F.packs.video.price)}/kk tai ${gt(F.packs.media.bytes)} tekstille ja kuville ${e(F.packs.media.price)}/kk.`,
            'Litessä julkaisu poistuu lopullisesti, kun sen aika umpeutuu. Pidä tärkeistä teksteistäsi ja videoistasi oma kopio.',
          ],
        },
        {
          title: '8. Maksut, uusiutuminen ja peruminen',
          body: [
            'Maksut käsittelee maksupalvelu Stripe (Stripe Checkout). Korttitietosi syötetään Stripen maksusivulle, eivätkä ne koskaan tule D2M:n palvelimille.',
            'Unlimited, Exclusive, lisätallennustila ja lukijan kuukausitilaus kirjoittajalle ovat kuukausimaksuja. Ne veloitetaan ensimmäisen kerran ostaessasi ja sen jälkeen automaattisesti kuukauden välein, kunnes peruutat ne.',
            'Ennen maksusivulle siirtymistä annat palvelussa nimenomaisen suostumuksen siihen, että pääset ostamaasi heti (katso Peruutus ja palautukset). Suostumuksen ajankohta tallennetaan ostoksen yhteyteen. Vahvistuksen maksusta saat Stripen sähköpostikuittina, ja ostos näkyy Ostot-luettelossa Oma paikka -sivulla.',
            'Voit lopettaa maksullisen tilauksen milloin tahansa vaihtamalla takaisin Liteen Oma paikka -sivulla. Silloin tilauksen ja lisätallennustilan kuukausimaksut päättyvät heti, eikä uusia veloituksia tehdä. Jo maksettua kuukautta ei hyvitetä, ellei peruutusoikeus tai kuluttajansuojalaki toisin edellytä. Kun palaat Liteen, julkaisut, joiden aika umpeutuu sen jälkeen, poistuvat kuten Litessä.',
            'Kirjoittajalle tehdyn kuukausitilauksen voit perua kirjoittajan profiilissa tai haussa (Peru tilaus). Tilaus ei silloin enää uusiudu, ja pääset kirjoittajan maksullisiin julkaisuihin maksetun kauden loppuun. Palvelu näyttää, mihin asti tilaus on auki.',
            `Jos kirjoittaja lopettaa kuukausitilauksen myymisen (vaihtaa pois Unlimitedistä, poistaa tilauksen hinnan tai poistaa tilinsä) tai hänen tilinsä jäädytetään, lukijoiden tilaukset hänelle päättyvät heti, eikä uusia veloituksia tehdä. Jo maksetusta kaudesta voit pyytää hyvitystä osoitteesta ${O.email}. Peruutusoikeudesta ja palautuksista kerrotaan Peruutus ja palautukset -sivulla.`,
            'Jos hinnat muuttuvat, kerromme siitä vähintään 30 päivää etukäteen. Muutos koskee vasta ilmoitusta seuraavia maksukausia, ja voit perua tilauksen ennen kuin se tulee voimaan.',
          ],
        },
        {
          title: '9. Ostaminen kirjoittajalta',
          body: [
            'Unlimited-kirjoittajan kuukausitilaus antaa pääsyn hänen maksullisiin julkisiin julkaisuihinsa niin kauan kuin tilaus on voimassa. Exclusive-kirjoittajan julkaisu ostetaan kerran, ja ostos antaa pääsyn julkaisuun ja sen keskusteluun niin kauan kuin julkaisu on palvelussa esillä. Kirjoittaja päättää, kuinka kauan julkaisu on esillä. Ennen ostoa näet, mihin asti julkaisu on luettavissa, tai että se on pysyvä.',
            'Ostot maksetaan D2M:n kautta Stripellä, ja D2M välittää kirjoittajan osuuden hänelle.',
          ],
        },
        {
          title: '10. Myyminen kirjoittajana',
          body: [
            'Myydäksesi sinun on liitettävä tiliisi Stripe Connect Express -tili. Stripe tunnistaa sinut ja maksaa tulosi pankkitilillesi. Stripe-tiliin sovelletaan Stripen omia ehtoja (Stripe Connected Account Agreement).',
            `Hinta, jonka asetat, on se, minkä ostaja maksaa, ja se sisältää arvonlisäveron. D2M pidättää myynnistä arvonlisäveron, jonka se tilittää, ja ${pct(F.fee)} palvelumaksun verottomasta hinnasta. Loput siirretään Stripe-tilillesi. Esimerkki: ${e(ex.price)} myynnistä arvonlisävero on ${e(ex.vat)}, palvelumaksu ${e(ex.fee)} ja osuutesi ${e(ex.author)}. Stripe voi periä omia maksujaan siirroista ja maksuista tilillesi.`,
            'Vastaat itse tulojesi tuloverotuksesta ja muista omista veroistasi ja velvoitteistasi. Emme toimita veroilmoituksia puolestasi.',
            'Myy vain sisältöä, jonka olet itse tehnyt tai johon sinulla on oikeus. Lukijalle on kerrottava rehellisesti, mitä hän ostaa.',
            `Jos poistat myymäsi julkaisun ${F.refundDays} päivän kuluessa ostosta (myös poistamalla tilisi), ostaja saa koko hinnan automaattisesti takaisin. Kun lopetat kuukausitilauksen myymisen, lukijoidesi tilaukset sinulle päättyvät heti.`,
            `Jos moderaattori poistaa myymäsi julkaisun, koska se rikkoo sisältösääntöjä tai lakia, ostajille ei palauteta hintaa automaattisesti (${F.refundDays} päivän palautus koskee vain julkaisuja, jotka poistat itse).`,
            'Jos ostaja saa hinnan takaisin (esimerkiksi peruutusoikeuden, poistamasi julkaisun tai virheen vuoksi, tai ostajan pyynnöstä sääntöjen vastaisen julkaisun vuoksi), osuutesi siitä myynnistä peritään takaisin Stripe-tililtäsi, ja D2M palauttaa oman osuutensa.',
          ],
        },
        {
          title: '11. Tilin jäädyttäminen',
          body: [
            'Voimme jäädyttää tilisi määräajaksi tai toistaiseksi, jos rikot näitä ehtoja tai lakia vakavasti tai toistuvasti, esimerkiksi julkaisemalla seksuaalista tai tekoälyllä tehtyä sisältöä. Jäädytyksestä päättää aina ihminen, ja saat sähköpostiisi päätöksen perustelut, ellei laki tai toisten turvallisuus estä sitä. Ensin pyrimme varoittamaan, jos rikkomus ei ole vakava.',
            'Jäädytyksen aikana et voi kirjautua sisään (kirjautuessasi näet syyn ja linkin valitukseen), istuntosi päättyvät, eikä profiiliasi tai julkaisujasi näytetä muille. Mitään ei poisteta, eikä tiliä poisteta automaattisesti. Lukijoidesi kuukausitilaukset sinulle päättyvät heti, eikä niitä veloiteta enää. Omat kuukausimaksusi (tilaus, lisätallennustila ja tilauksesi muille kirjoittajille) eivät uusiudu, ja maksettu kausi on käytössäsi loppuun; jäädytyksen päätyttyä voit tilata ne uudelleen.',
            'Voit valittaa jäädytyksestä kuten muistakin päätöksistä (kohta 5). Kun jäädytys päättyy tai se perutaan, voit taas kirjautua sisään, ja profiilisi ja julkaisusi näkyvät taas.',
          ],
        },
        {
          title: '12. Vastuu',
          body: [
            'Pyrimme pitämään palvelun toiminnassa ja tietosi tallessa. Palvelussa voi kuitenkin olla katkoja esimerkiksi huollon tai teknisten vikojen vuoksi. Kerromme suunnitelluista katkoista etukäteen, kun se on mahdollista.',
            'Emme vastaa käyttäjien julkaisemasta sisällöstä, mutta poistamme laittoman sisällön, kun saamme siitä tiedon.',
            'Emme vastaa välillisistä vahingoista, kuten saamatta jääneestä tulosta, ellei vahinko johdu huolimattomuudestamme.',
            'Nämä rajoitukset eivät koske tahallisesti tai törkeällä huolimattomuudella aiheutettua vahinkoa, eivätkä ne rajoita kuluttajansuojalain tai muun pakottavan lain mukaisia oikeuksiasi. Jos maksullinen palvelu ei vastaa sitä, mitä on luvattu, sinulla on kuluttajansuojalain mukaiset oikeudet virheen korjaamiseen, hinnanalennukseen tai sopimuksen purkamiseen.',
          ],
        },
        {
          title: '13. Ehtojen muuttaminen',
          body: [
            'Voimme muuttaa näitä ehtoja esimerkiksi palvelun, lain tai maksujen muuttuessa. Kerromme olennaisista muutoksista sähköpostitse tai palvelussa vähintään 30 päivää ennen kuin ne tulevat voimaan. Jos et hyväksy muutosta, voit lopettaa palvelun käytön ja perua maksulliset tilaukset ennen muutoksen voimaantuloa.',
          ],
        },
        {
          title: '14. Sovellettava laki ja riidat',
          body: [
            'Näihin ehtoihin sovelletaan Suomen lakia. Jos asut toisessa EU-maassa, sinulla on lisäksi asuinmaasi pakottavan kuluttajansuojalain antama suoja.',
            `Ota ensin yhteyttä meihin (${O.email}), niin yritämme ratkaista asian. Kuluttajana voit saada maksutonta neuvontaa kuluttajaneuvonnasta (kuluttajaneuvonta.fi) ja viedä riidan Kuluttajariitalautakunnan käsiteltäväksi (kuluttajariita.fi). Lautakunnan ratkaisut ovat suosituksia. Jos asut toisessa EU-maassa, voit kääntyä myös Euroopan kuluttajakeskuksen puoleen (kuluttajaneuvonta.fi/eck).`,
            'Kuluttaja voi nostaa kanteen myös oman kotikuntansa käräjäoikeudessa.',
          ],
        },
      ],
    },

    // ---------------- tietosuojaseloste ----------------
    privacy: {
      title: 'Tietosuojaseloste',
      lead: 'Tämä seloste kertoo, mitä henkilötietoja D2M käsittelee, miksi ja millä perusteella, kenelle tietoja annetaan ja mitä oikeuksia sinulla on (EU:n yleinen tietosuoja-asetus, GDPR).',
      sections: [
        {
          title: '1. Rekisterinpitäjä',
          body: [
            `${O.name}, Y-tunnus ${O.businessId}, ${O.address}, Suomi.`,
            `Tietosuoja-asiat: ${O.email}.`,
          ],
        },
        {
          title: '2. Mitä tietoja käsittelemme ja miksi',
          body: [
            'Käsittelemme vain tietoja, joita palvelu tarvitsee. Emme käytä mainontaa, analytiikkaa emmekä seurantaa, emmekä myy tietoja kenellekään.',
            [
              'Tilin tiedot: näyttönimi, käyttäjänimi (julkinen), sähköpostiosoite ja salasana (tallennetaan vain tiivisteenä, ei selväkielisenä). Tarkoitus: tilin luominen, kirjautuminen ja yhteydenpito palvelua koskevissa asioissa. Peruste: sopimus (GDPR 6 art. 1 b).',
              'Sähköpostiviestit: lähetämme sähköpostiosoitteeseesi vain palvelun toimintaan kuuluvia viestejä: linkin osoitteen vahvistamiseen rekisteröitymisen jälkeen, salasanan palautuslinkin, kun sitä pyydetään, sähköpostiosoitteen vaihdossa vahvistuslinkin uuteen osoitteeseen ja ilmoituksen vanhaan, sekä moderoinnin viestit (päätöksen perustelut, tieto ilmoituksesi käsittelystä ja valituksen ratkaisu). Tallennamme, milloin osoite on vahvistettu, sekä voimassa olevista linkeistä vain tunnisteen tiivisteen, mihin osoitteeseen linkki lähetettiin ja milloin se vanhenee (vahvistuslinkki 24 tunnin, palautuslinkki tunnin kuluttua). Ostaminen, myyminen ja julkinen profiili edellyttävät vahvistettua osoitetta. Emme lähetä markkinointiviestejä. Tarkoitus: varmistaa, että osoite on sinun, ja palauttaa pääsy tiliin. Peruste: sopimus.',
              'Kutsukoodi: palvelun suljetun testivaiheen (beta) aikana tiliin tallennetaan kutsukoodi, jolla liityit. Tarkoitus: testivaiheen hallinta, esimerkiksi sen seuraaminen, mitä kautta testaajat tulivat. Peruste: oikeutettu etu (6 art. 1 f).',
              'Profiili: profiilikuva, taustakuva, esittelyteksti ja valinta julkisesta profiilista. Tarkoitus: näyttää profiilisi niille, joille olet sen valinnut näkyväksi. Peruste: sopimus.',
              'Ystävät: keitä olet lisännyt ystäviksesi. Peruste: sopimus.',
              'Mielenkiinnon kohteet: valitsemasi aiheet ja enintään kymmenen omaa sanaa sekä tieto siitä, oletko jo vastannut tai ohittanut kysymyksen niistä rekisteröitymisen jälkeen. Ne näet vain sinä: niitä ei näytetä profiilissasi eikä kenellekään muulle. Tarkoitus: järjestää Sinulle-sivusi julkiset jutut. Järjestämiseen käytetään vain valitsemiasi kiinnostuksen kohteita ja julkaisujen julkisia tietoja (otsikko, teksti, aiheet, ikä ja keskusteluviestien määrä) sekä sitä, onko kirjoittaja ystäväsi. Siihen ei käytetä sitä, mitä luet tai avaat, eikä sitä varten tallenneta mitään käytöstäsi. Peruste: sopimus.',
              'Julkisten julkaisujen aiheet: kirjoittajan valitsemat aiheet tai, jos hän ei valinnut, otsikosta ja tekstistä sanalistojen avulla luetut aiheet. Tarkoitus: Sinulle-sivu ja haku aiheittain. Peruste: sopimus.',
              'Ryhmät: perustamasi ryhmät (nimi, kuvaus, kaveriryhmän kuva, kiinnostusryhmän aihe), jäsenyytesi ja roolisi niissä (jäsen tai ylläpitäjä) ja liittymisaika, kutsut (kenet kutsuttiin, kuka kutsui ja milloin) sekä kiinnostusryhmien estot. Kaveriryhmän jäsenet näkevät toisensa ja odottavat kutsut; kiinnostusryhmän jäsenluettelon näkevät vain sen ylläpitäjät (muut näkevät jäsenmäärän ja ylläpitäjät). Tarkoitus: ryhmien toiminta. Peruste: sopimus.',
              'Sisältö: blogit, vlogit, kuvat, kirjeet, BoVNotet, keskusteluviestit, kenelle julkaisu näkyy, sen elinaika sekä tieto siitä, onko BoVNote nähty. Videoista luetaan pituus ja niistä tehdään pienempi katselukopio. Tarkoitus: sisällön tallentaminen ja näyttäminen valitsemillesi lukijoille. Peruste: sopimus.',
              'Ostot ja tilaukset: tilauksesi, lisätallennustila, kirjoittajille tehdyt tilaukset ja ostetut julkaisut sekä Stripen tunnisteet (maksuistunnon, tilauksen, maksun ja Connect-tilin tunnisteet). Jokaisesta ostoksesta pidetään ostolokia: ostoksen laji, Stripen tunnisteet, summa, ostoaika, nimenomaisen suostumuksesi ajankohta sekä mahdollinen peruutus ja palautus. Korttitietoja emme saa emmekä käsittele. Tarkoitus: maksujen veloittaminen, ostetun sisällön avaaminen, kirjoittajien tulojen tilittäminen, peruutukset ja palautukset sekä näyttö suostumuksestasi. Peruste: sopimus; kirjanpitoon tarvittavat tiedot ja suostumuksen näyttö: lakisääteinen velvoite (6 art. 1 c, kirjanpitolaki, arvonlisäverolaki ja kuluttajansuojalaki).',
              'Ilmoitukset: kuka ilmoitti julkaisusta, milloin ja millä syyllä (seksuaalinen sisältö, tekoälyllä tehty sisältö tai muu syy). Ilmoituslomakkeella ilman tiliä tehdyistä ilmoituksista: ilmoittajan sähköpostiosoite, sisällön osoite, rikottu sääntö ja perustelu. Tarkoitus: sisältösääntöjen valvonta ja laittoman sisällön poistaminen. Peruste: oikeutettu etu pitää palvelu turvallisena (6 art. 1 f) ja digipalvelusäädöksen (EU 2022/2065) velvoitteet (6 art. 1 c).',
              'Moderointi: päätökset (mitä päätettiin, minkä julkaisun otsikko ja tunniste tai kenen tilin käyttäjänimi, rikottu sääntö, kirjoitettu perustelu, tosiasiat eli ilmoitusten määrät syittäin, kuka moderaattori päätti ja milloin; ei koskaan julkaisun sisältöä), jäädytykset (syy ja kesto), valitukset (teksti ja sähköpostiosoite, johon ratkaisu lähetetään), valituslinkin tunnisteen tiiviste sekä moderointiloki (jokainen moderointitoimi: kuka, milloin, mitä ja miksi). Tarkoitus: päätösten perustelut, valitusten käsittely ja toimien jäljitettävyys. Peruste: digipalvelusäädöksen velvoitteet (6 art. 1 c) ja oikeutettu etu (6 art. 1 f).',
              `Tekniset tiedot: IP-osoite ja selaimen tiedot palvelimen pyynnöissä sekä istuntoeväste. Tarkoitus: palvelun toimittaminen ja tietoturva, esimerkiksi väärinkäytösten estäminen. Peruste: oikeutettu etu (6 art. 1 f). [Palvelimen lokit: mitä tallennetaan ja kuinka kauan.]`,
            ],
            'Tiedot saadaan sinulta itseltäsi, muilta käyttäjiltä (esimerkiksi kun joku lisää sinut ystäväkseen tai kirjoittaa sinulle kirjeen) ja Stripeltä (maksun tila).',
          ],
        },
        {
          title: '3. Kuka tietoja näkee',
          body: [
            'Muut käyttäjät näkevät näyttönimesi, käyttäjänimesi ja profiilikuvasi sekä ne julkaisut, jotka olet heille valinnut. Julkiset julkaisut ja julkinen profiili näkyvät kenelle tahansa, myös ilman tiliä, ja hakukoneet voivat löytää ne. Kun kirjoitat julkisen julkaisun keskusteluun, viestisi sekä näyttönimesi, käyttäjänimesi ja profiilikuvasi näkyvät samoin kenelle tahansa. Sähköpostiosoitettasi, kirjeitäsi, BoVNotejasi, ystävillesi rajattuja julkaisujasi eikä sitä, oletko juuri nyt paikalla keskustelussa, näytetä kenellekään ilman tiliä. Kaveriryhmän julkaisut keskusteluineen näkevät vain sen jäsenet; kiinnostusryhmän julkaisut keskusteluineen näkevät kaikki kirjautuneet käyttäjät, mutta eivät ihmiset ilman tiliä eivätkä hakukoneet. Moderaattorit näkevät ilmoitetun julkaisun kokonaan, myös vain ystäville, ryhmälle tai kirjeenä kirjoitetun, sekä sen kirjoittajan, jotta he voivat käsitellä ilmoituksen; muuten ylläpito näkee tietoja vain, kun se on tarpeen palvelun ylläpitämiseksi.',
          ],
        },
        {
          title: '4. Käsittelijät ja muut vastaanottajat',
          body: [
            'Käytämme seuraavia palveluntarjoajia. Ne käsittelevät tietoja puolestamme sopimuksen perusteella, eivätkä ne saa käyttää tietoja omiin tarkoituksiinsa, ellei toisin kerrota.',
            [
              'Stripe (Stripe Payments Europe Ltd, Irlanti): maksujen käsittely ja kirjoittajien Connect-tilit. Stripe käsittelee maksu- ja korttitietoja, ja se on joiltakin osin itsenäinen rekisterinpitäjä (esimerkiksi petosten estäminen, rahanpesulain mukainen tunnistaminen ja kirjoittajien Connect-tilit). Stripen tietosuojaseloste: stripe.com/privacy.',
              'Cloudflare (Cloudflare, Inc.): ladattujen kuvien ja videoiden tallennus (Cloudflare R2). Tiedostot ovat suljetussa tallennustilassa, ja niihin pääsee vain lyhytaikaisilla allekirjoitetuilla osoitteilla.',
              'Cloudflare (Cloudflare, Inc.): palvelun sähköpostiviestien lähettäminen (Cloudflare Email Service). Cloudflare käsittelee vastaanottajan sähköpostiosoitteen ja viestin sisällön toimittaakseen viestin.',
              `${O.host}: palvelin, jolla sovellus ja muut tiedot ovat (${O.hostLocation}).`,
            ],
            'Voimme luovuttaa tietoja viranomaisille, kun laki sitä edellyttää.',
          ],
        },
        {
          title: '5. Siirrot EU:n ja ETA:n ulkopuolelle',
          body: [
            'Stripe ja Cloudflare ovat kansainvälisiä yrityksiä, joiden konserniin kuuluu yhdysvaltalaisia yhtiöitä, joten tietoja voidaan käsitellä myös EU:n ja ETA:n ulkopuolella. Tällöin siirto perustuu Euroopan komission hyväksymiin vakiosopimuslausekkeisiin tai, siltä osin kuin vastaanottaja on sitoutunut EU:n ja Yhdysvaltain väliseen tietosuojakehykseen (EU-US Data Privacy Framework), komission tietosuojan riittävyyttä koskevaan päätökseen. [Tarkista kunkin palveluntarjoajan voimassa oleva siirtoperuste, R2-säilön sijaintialue ja Cloudflare Email Servicen käsittelypaikka.]',
          ],
        },
        {
          title: '6. Kuinka kauan tietoja säilytetään',
          body: [
            [
              'Lite-tilauksen julkaisut poistetaan, kun niiden aika umpeutuu: blogi vuorokauden, vlogi kahden päivän ja kirje viikon kuluttua.',
              'Maksullisen tilauksen julkaisut, joiden aika on umpeutunut, säilyvät arkistossasi, jonka vain sinä näet, kunnes poistat ne.',
              'Kun julkaisu poistetaan, sen kuvat ja videot, keskustelu, BoVNotet ja siitä tehdyt ilmoitukset poistetaan sen mukana.',
              'Kun ryhmä poistetaan, sen julkaisut poistetaan samoin, ja sen jäsenyydet, kutsut ja estot sen mukana. Kun poistat tilisi, jäsenyytesi, kutsusi ja estosi poistetaan; ryhmä, jonka viimeinen ylläpitäjä olit, poistetaan julkaisuineen (kaveriryhmä tai tyhjä kiinnostusryhmä), tai kiinnostusryhmän ylläpito siirtyy sen pisimpään jäsenenä olleelle.',
              'Tilin tiedot säilytetään, kunnes poistat tilin (Oma paikka > Poista tili). Vaihdettu käyttäjänimi säilytetään 30 päivää vaihdosta, jotta kukaan muu ei voi ottaa sitä heti; se poistetaan viimeistään tilin mukana. Silloin poistetaan heti tilisi ja istuntosi, mielenkiinnon kohteesi, profiilisi kuvineen, julkaisusi tiedostoineen, viestisi kaikissa keskusteluissa, BoVNotesi, ystävyytesi, tilauksesi molempiin suuntiin, ostettujen julkaisujen pääsyoikeudet ja tekemäsi ilmoitukset. Ostolokin rivit säilytetään kirjanpitoa varten ilman tunnistettasi: vain Stripen tunnisteet, summat ja ajat.',
              'Sähköpostilinkin tiedot poistetaan, kun linkkiä käytetään tai sen tilalle pyydetään uusi, ja vanhentuneet poistetaan säännöllisesti; kaikki poistetaan viimeistään tilin mukana. Kutsukoodi säilytetään tilin tiedoissa, ja se poistetaan tilin mukana.',
              `Ilmoitukset säilytetään ${F.reportMonths} kuukautta, minkä jälkeen ne poistetaan automaattisesti. Julkaisun ilmoitukset poistetaan aiemmin, kun moderaattori on käsitellyt ne tai julkaisu poistetaan. Ilmoituslomakkeen ilmoitukset säilytetään ${F.reportMonths} kuukautta.`,
              `Moderointipäätösten tiedot (ilman julkaisun sisältöä) ja niistä tehdyt valitukset säilytetään ${F.complaintMonths} kuukautta päätöksestä eli valitusajan, pidempään vain, jos valitus on vielä käsittelemättä tai päätöksen jäädytys jatkuu. Ne säilyvät tämän ajan myös, jos tili poistetaan: silloin ilman tilin tunnistetta, mutta käyttäjänimen kanssa. Moderointiloki säilytetään ${F.auditMonths} kuukautta.`,
              'Maksuja ja kirjanpitoa koskevat tiedot säilytetään kirjanpitolain mukaan kuusi vuotta sen vuoden lopusta, jonka aikana tilikausi päättyi.',
              'Varmuuskopioista poistettu tieto häviää viimeistään [varmuuskopioiden säilytysaika] kuluttua.',
            ],
          ],
        },
        {
          title: '7. Oikeutesi',
          body: [
            'Sinulla on oikeus:',
            [
              'saada tietää, mitä tietoja sinusta käsitellään, ja saada niistä kopio;',
              'vaatia virheellisten tietojen korjaamista;',
              'vaatia tietojesi poistamista (lakisääteisesti säilytettäviä tietoja lukuun ottamatta);',
              'vaatia käsittelyn rajoittamista;',
              'vastustaa oikeutettuun etuun perustuvaa käsittelyä;',
              'saada itse antamasi tiedot koneluettavassa muodossa ja siirtää ne toiseen palveluun.',
            ],
            `Lähetä pyyntö osoitteeseen ${O.email} siitä sähköpostiosoitteesta, jolla tilisi on luotu. Vastaamme kuukauden kuluessa. Pyynnöt ovat maksuttomia. Voit poistaa omia julkaisujasi, muuttaa profiiliasi ja poistaa koko tilisi tietoineen myös itse palvelussa (Oma paikka > Poista tili).`,
            'Jos katsot, että tietojasi käsitellään lain vastaisesti, voit tehdä valituksen tietosuojavaltuutetulle (tietosuoja.fi) tai oman asuinmaasi tietosuojaviranomaiselle.',
          ],
        },
        {
          title: '8. Evästeet ja selaimen tallennustila',
          body: [
            'D2M käyttää vain palvelun toiminnan kannalta välttämättömiä tallenteita, eikä niihin tarvita suostumusta:',
            [
              'd2m_session: istuntoeväste (httpOnly), joka pitää sinut kirjautuneena. Se poistuu, kun kirjaudut ulos tai istunto vanhenee [istunnon kesto].',
              'd2m.lang (selaimen localStorage): valitsemasi kieli.',
              'd2m.upload:… (localStorage), vain videon latauksen ajan: tiedoston nimi, koko ja latauksen tunniste, jotta katkennut lataus voi jatkua siitä, mihin se jäi. Tieto poistetaan, kun lataus on valmis tai keskeytetään.',
            ],
            'Muita evästeitä ei käytetä: ei analytiikkaa, mainoksia eikä kolmansien osapuolten seurantaa. Stripen maksusivu (stripe.com) voi käyttää omia evästeitään maksun turvallisuuteen; niistä kerrotaan Stripen omassa selosteessa.',
          ],
        },
        {
          title: '9. Tietoturva',
          body: [
            'Yhteydet palveluun salataan (HTTPS). Salasanat tallennetaan vain tiivisteinä. Kuvat ja videot ovat suljetussa tallennustilassa, josta niitä jaetaan vain lyhytaikaisilla osoitteilla. Pääsy tietoihin on rajattu niille, jotka tarvitsevat sitä palvelun ylläpitoon.',
            'Jos tietojasi koskee tietoturvaloukkaus, josta aiheutuu sinulle korkea riski, kerromme siitä sinulle viipymättä.',
          ],
        },
        {
          title: '10. Muutokset',
          body: ['Jos tämä seloste muuttuu olennaisesti, kerromme siitä palvelussa tai sähköpostitse.'],
        },
      ],
    },

    // ---------------- peruutus- ja palautusehdot ----------------
    refunds: {
      title: 'Peruutus- ja palautusehdot',
      lead: 'Näin peruutusoikeus, kuukausitilausten lopettaminen ja palautukset toimivat D2M:ssä.',
      sections: [
        {
          title: '1. Peruutusoikeus',
          body: [
            'Kuluttajana sinulla on kuluttajansuojalain mukaan 14 päivän peruutusoikeus verkossa tehtyihin ostoihin. Aika lasketaan ostopäivästä.',
            'Yksittäinen julkaisu (Exclusive) on digitaalista sisältöä. Peruutusoikeus päättyy, kun pääsy julkaisuun alkaa, jos olet ostaessasi nimenomaisesti pyytänyt pääsyä heti ja vahvistanut tietäväsi, että menetät silloin peruutusoikeuden. D2M pyytää tämän ennen maksusivulle siirtymistä pakollisella valintaruudulla: ”Pyydän, että pääsen sisältöön heti, ja ymmärrän, että menetän 14 päivän peruuttamisoikeuteni.” Ilman sitä ostos ei etene.',
            `Unlimited, Exclusive, lisätallennustila ja kirjoittajalle tehty kuukausitilaus ovat digitaalisia palveluita. Ennen maksusivulle siirtymistä pyydät valintaruudulla, että palvelu alkaa heti, ja vahvistat ymmärtäväsi, että jos peruutat sopimuksen ${F.withdrawalDays} päivän kuluessa, saat takaisin vain käyttämättömän osuuden. Jos peruutat ${F.withdrawalDays} päivän kuluessa ostosta, sopimus päättyy heti ja palautamme viimeisimmästä maksusta osuuden, joka vastaa maksukaudesta jäljellä olevaa aikaa. [Tarkistettava: koskeeko kuukausitilauksia digitaalisen sisällön vai digitaalisen palvelun peruutussääntö.]`,
            'Suostumuksesi ajankohta tallennetaan ostoksen yhteyteen D2M:n ostolokiin. Vahvistuksen ostoksesta saat Stripen sähköpostikuittina, ja ostos näkyy suostumuksen ajankohtineen Ostot-luettelossa Oma paikka -sivulla.',
          ],
        },
        {
          title: '2. Näin peruutat',
          body: [
            `Peruuta palvelussa: Oma paikka > Ostot > Peruuta sopimus. Siinä ovat kuukausisopimuksesi, jotka on ostettu viimeisen ${F.withdrawalDays} päivän aikana ja ovat yhä voimassa. Kun peruutat, sopimus päättyy heti, käyttämätön osuus palautetaan Stripen kautta samalle maksutavalle, jolla maksoit, ja peruutus kirjataan ostolokiin. Palautuksen näkyminen tililläsi voi kestää muutaman päivän.`,
            'Jos peruutat Unlimitedin tai Exclusiven, palaat Liteen, ja lisätallennustila päättyy samalla, koska se kuuluu maksullisiin tilauksiin. Jos ostit lisätallennustilaa viimeisen 14 päivän aikana, peruuta se ensin, niin saat senkin käyttämättömän osuuden takaisin.',
            `Voit ilmoittaa peruutuksesta ${F.withdrawalDays} päivän kuluessa myös sähköpostitse osoitteeseen ${O.email}. Voit käyttää alla olevaa lomaketta, mutta se ei ole pakollista: riittää, että kerrot selvästi peruvasi ostoksen. Sähköpostitse ilmoitetuissa peruutuksissa palautamme rahat viimeistään 14 päivän kuluessa ilmoituksesta samalla maksutavalla, jolla maksoit, ellemme toisin sovi.`,
            `Peruutuslomake: Vastaanottaja: ${O.name}, ${O.address}, ${O.email}. Ilmoitan, että peruutan sopimuksen seuraavan digitaalisen sisällön tai palvelun ostamisesta: ______. Tilattu: ______. Kuluttajan nimi ja tilin sähköpostiosoite: ______. Päiväys: ______.`,
          ],
        },
        {
          title: '3. Kuukausitilausten lopettaminen',
          body: [
            'Kuukausitilaukset jatkuvat ja veloitetaan kuukausittain, kunnes lopetat ne. Lopettamiseen ei ole irtisanomisaikaa.',
            [
              'Unlimited, Exclusive ja lisätallennustila: vaihda takaisin Liteen Oma paikka -sivulla. Kuukausimaksut päättyvät heti, eikä uusia veloituksia tehdä.',
              'Kirjoittajalle tehty kuukausitilaus: paina Peru tilaus kirjoittajan profiilissa tai haussa. Tilaus ei enää uusiudu, ja luet kirjoittajan maksullisia julkaisuja maksetun kauden loppuun. Palvelu näyttää, mihin asti tilaus on auki.',
              'Tilin poistaminen (Oma paikka > Poista tili) päättää kaikki kuukausimaksusi heti.',
            ],
            `Jos kirjoittaja lopettaa kuukausitilauksen myymisen tai poistaa tilinsä, tai hänen tilinsä jäädytetään, tilauksesi hänelle päättyy heti, eikä uusia veloituksia tehdä. Jo maksetusta kaudesta voit pyytää hyvitystä osoitteesta ${O.email}.`,
            'Jos oma tilisi jäädytetään, kuukausimaksusi eivät uusiudu: maksettu kausi on käytössäsi loppuun, eikä uusia veloituksia tehdä.',
            'Jo alkanutta kuukautta ei hyvitetä lopettaessasi, paitsi peruutusoikeuden aikana (Peruuta sopimus) tai jos palvelussa on virhe.',
          ],
        },
        {
          title: '4. Ostettujen julkaisujen palautukset',
          body: [
            'Kun pääsy ostettuun julkaisuun on alkanut ja olet hyväksynyt peruutusoikeuden päättymisen, hintaa ei palauteta pelkästään siksi, että muutit mielesi.',
            'Ennen ostoa näet, kuinka kauan julkaisu on luettavissa: päivämäärän, johon asti se on esillä, tai tiedon, että se on pysyvä. Kun julkaisun aika päättyy, hintaa ei palauteta.',
            `Jos kirjoittaja poistaa julkaisun ${F.refundDays} päivän kuluessa ostostasi (myös poistamalla tilinsä), palautamme koko hinnan automaattisesti Stripen kautta samalle maksutavalle, jolla maksoit.`,
            'Palautamme hinnan tai korjaamme asian myös, jos:',
            [
              'julkaisu ei avaudu tai se ei vastaa sitä, mitä siitä luvattiin;',
              'olet maksanut saman julkaisun kahdesti tai maksussa on muu virhe.',
            ],
            `Jos moderaattori poistaa julkaisun, koska se rikkoo sisältösääntöjä tai lakia, hintaa ei palauteta automaattisesti, eikä ${F.refundDays} päivän automaattinen palautus koske sitä. Jos ostit tällaisen julkaisun ja katsot, ettei se vastannut sitä, mitä luvattiin, voit pyytää hyvitystä osoitteesta ${O.email}.`,
            'Nämä eivät rajoita kuluttajansuojalain mukaisia oikeuksiasi virheen vuoksi.',
          ],
        },
        {
          title: '5. Yhteys',
          body: [
            `Peruutukset, palautukset ja maksuja koskevat kysymykset: ${O.email}. Kerro tilisi sähköpostiosoite, ostos ja ostopäivä, niin asia hoituu nopeammin. Vastaamme [vastausaika, esim. viikon] kuluessa.`,
          ],
        },
      ],
    },

    // ---------------- sisältösäännöt ----------------
    rules: {
      title: 'Sisältösäännöt',
      lead: 'D2M on paikka ystäville. Nämä säännöt koskevat kaikkea sisältöä: julkaisuja, kirjeitä, BoVNoteja, keskusteluja ja profiileja, myös yksityisiä.',
      sections: [
        {
          title: 'Sallittu',
          body: [
            [
              'Intiimi elämä: voit kirjoittaa omasta ja yksityisestä elämästäsi, kuten parisuhteesta, rakkaudesta, tunteista, surusta, mielenterveydestä, terveydestä ja kehosta, sekä seksuaalisuudesta aiheena asiallisesti (kokemukset, tieto) ilman yksityiskohtaisia kuvauksia.',
              'Tavalliset apuvälineet: oikeinkirjoituksen ja kieliopin tarkistus, puhelimen kameran oma kuvankäsittely sekä tavallinen rajaus ja värien säätö.',
            ],
          ],
        },
        {
          title: 'Ei sallittu',
          body: [
            [
              'Seksuaalinen sisältö: pornografia, seksuaalisesti avoimet tai vihjailevat kuvat, videot ja tekstit sekä seksipalvelujen tarjoaminen. Tämä koskee koko palvelua, myös kirjeitä ja vain ystäville näkyviä julkaisuja.',
              'Alastomuus, myös ei-seksuaalinen (taide, imetys, lääketiede): [Omistajan päätös: toistaiseksi ei sallittu. Vaihda tähän joko "ei sallittu" tai "sallittu, kun se ei ole seksuaalista".]',
              'Lapsia seksualisoiva sisältö, aina. Poistamme sen heti ja ilmoitamme siitä poliisille, kuten laki edellyttää.',
              'Tekoälyllä tehty sisältö: kokonaan tai pääosin generatiivisella tekoälyllä tehty teksti, tekoälyllä luodut tai muokatut kuvat ja videot, tekoälyäänet sekä aina oikeista ihmisistä tehdyt syväväärennökset (deepfaket). Tämäkin koskee koko palvelua, myös kirjeitä ja vain ystäville näkyviä julkaisuja.',
              'Laiton sisältö, esimerkiksi toisen tekijänoikeutta loukkaava aineisto, kunnianloukkaus, laiton uhkaus, kiihottaminen kansanryhmää vastaan, toisen yksityisten tietojen tai kuvien levittäminen ilman lupaa sekä huijaukset.',
              'Häirintä: kiusaaminen, uhkailu, vainoaminen ja toisen nöyryyttäminen.',
              'Toiseksi henkilöksi tekeytyminen ja roskaposti.',
            ],
          ],
        },
        {
          title: 'Kun julkaiset julkisesti',
          body: ['Julkinen julkaisu voi näkyä kaikille For You -sivulla, ja kuka tahansa voi lukea sen keskusteluineen ilman tiliäkin, myös hakukoneet. Siksi vahvistat julkaistessasi, että juttu on omaa työtäsi eikä tekoälyllä tehty, eikä siinä ole seksuaalista sisältöä.'],
        },
        {
          title: 'Tekoälysisällön valvonta',
          body: ['Meillä ei ole automaattista tekoälysisällön tunnistusta. Sääntöä valvotaan kirjoittajan omalla vahvistuksella ja ilmoituksilla: jos epäilet, että juttu on tehty tekoälyllä, ilmoita siitä syyllä Tekoälyllä tehtyä sisältöä. Moderaattori arvioi ilmoituksen.'],
        },
        {
          title: 'Ryhmissä',
          body: [
            'Nämä säännöt koskevat myös ryhmiä, kaveriryhmiä ja kiinnostusryhmiä. Kiinnostusryhmän julkaisun voivat lukea kaikki kirjautuneet, joten siihen kirjoittaessasi vahvistat saman kuin julkisesti julkaistessasi. Ryhmän ylläpitäjä voi poistaa julkaisuja ryhmästä ja estää käyttäjiä kiinnostusryhmästä, mutta sääntöjen rikkomuksista päättävät D2M:n moderaattorit: ilmoita ryhmän julkaisusta sen Ilmoita-painikkeella.',
          ],
        },
        {
          title: 'Näin ilmoitat',
          body: [
            `Paina julkaisun Ilmoita-painiketta ja valitse syy: seksuaalista sisältöä, tekoälyllä tehtyä sisältöä tai muu syy. Ilman tiliä voit ilmoittaa {ilmoituslomakkeella|/report-content} tai sähköpostitse osoitteeseen ${O.email}.`,
            'Kun kolme eri käyttäjää ilmoittaa samasta julkaisusta, se poistuu For You -sivulta heti, kunnes moderaattori on käsitellyt sen.',
          ],
        },
        {
          title: 'Mitä sitten tapahtuu',
          body: [
            [
              'Ilmoituksen käsittelee ihminen, moderaattori, joka näkee ilmoitetun julkaisun kokonaan. Jos julkaisu ei riko sääntöjä, ilmoitukset poistetaan ja se palaa näkyviin.',
              'Jos se rikkoo sääntöjä, moderaattori poistaa sen tai rajoittaa sitä niin, että vain sen kirjoittaja näkee sen, ja kirjoittaja saa sähköpostiinsa päätöksen perustelut.',
              'Vakavista tai toistuvista rikkomuksista tili jäädytetään määräajaksi tai toistaiseksi. Tiliä ei poisteta automaattisesti.',
              'Ilmoittaja saa sähköpostiinsa tiedon päätöksestä.',
              'Rikoksista ilmoitamme poliisille.',
            ],
            `Jos päätös koskee sinua ja olet eri mieltä, voit valittaa ${F.complaintMonths} kuukauden kuluessa perusteluviestin linkistä. Valituksen käsittelee ihminen. Ilmoittajana voit pyytää uudelleenarviointia kirjoittamalla meille.`,
          ],
        },
      ],
    },

    // ---------------- yhteystiedot ----------------
    contact: {
      title: 'Yhteystiedot',
      lead: 'Kuka Dear to Me -palvelua ylläpitää ja miten meihin saa yhteyden.',
      sections: [
        {
          title: 'Palveluntarjoaja',
          body: [
            [
              `Nimi: ${O.name}`,
              `Y-tunnus: ${O.businessId}`,
              `ALV-numero: ${O.vatId}`,
              `Osoite: ${O.address}, Suomi`,
              `Sähköposti: ${O.email}`,
              `Puhelin: ${O.phone}`,
            ],
            'Maksut käsittelee Stripe. Maksusivulla ja tiliotteella maksun saaja voi näkyä nimellä [Stripe-tilin nimi].',
          ],
        },
        {
          title: 'Mihin asioihin',
          body: [
            `Kaikki yhteydenotot, myös tietosuojapyynnöt, peruutukset, palautukset ja ilmoitukset laittomasta sisällöstä (myös {ilmoituslomakkeella|/report-content}): ${O.email}. Viranomaiset voivat ottaa yhteyttä samaan osoitteeseen (digipalvelusäädöksen yhteyspiste). Palvelemme suomeksi ja englanniksi.`,
          ],
        },
      ],
    },
  },
};

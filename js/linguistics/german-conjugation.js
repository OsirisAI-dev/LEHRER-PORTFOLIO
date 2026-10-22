/**
 * js/linguistics/german-conjugation.js
 * Dedicated German verb conjugation engine and irregular verb database.
 * Supports present (Präsens), preterite (Präteritum), perfect (Perfekt),
 * pluperfect (Plusquamperfekt), future (Futur I & II), conditional (Konditional I & II),
 * subjunctive (Konjunktiv I & II), imperative (Imperativ), and separable prefixes (trennbare Verben).
 */

(function (global) {
    'use strict';

        const PERSONS = ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'Sie/sie'];

        const IRREGULAR_VERBS = {

            sein:       { pr:['bin','bist','ist','sind','seid','sind'], pt:['war','warst','war','waren','wart','waren'], aux:'sein', p2:'gewesen' },
            haben:      { pr:['habe','hast','hat','haben','habt','haben'], pt:['hatte','hattest','hatte','hatten','hattet','hatten'], aux:'haben', p2:'gehabt' },
            werden:     { pr:['werde','wirst','wird','werden','werdet','werden'], pt:['wurde','wurdest','wurde','wurden','wurdet','wurden'], aux:'sein', p2:'geworden' },
            koennen:    { pr:['kann','kannst','kann','können','könnt','können'], pt:['konnte','konntest','konnte','konnten','konntet','konnten'], aux:'haben', p2:'gekonnt' },
            muessen:    { pr:['muss','musst','muss','müssen','müsst','müssen'], pt:['musste','musstest','musste','mussten','musstet','mussten'], aux:'haben', p2:'gemusst' },
            wollen:     { pr:['will','willst','will','wollen','wollt','wollen'], pt:['wollte','wolltest','wollte','wollten','wolltet','wollten'], aux:'haben', p2:'gewollt' },
            sollen:     { pr:['soll','sollst','soll','sollen','sollt','sollen'], pt:['sollte','solltest','sollte','sollten','solltet','sollten'], aux:'haben', p2:'gesollt' },
            duerfen:    { pr:['darf','darfst','darf','dürfen','dürft','dürfen'], pt:['durfte','durftest','durfte','durften','durftet','durften'], aux:'haben', p2:'gedurft' },
            moegen:     { pr:['mag','magst','mag','mögen','mögt','mögen'], pt:['mochte','mochtest','mochte','mochten','mochtet','mochten'], aux:'haben', p2:'gemocht' },
            wissen:     { pr:['weiß','weißt','weiß','wissen','wisst','wissen'], pt:['wusste','wusstest','wusste','wussten','wusstet','wussten'], aux:'haben', p2:'gewusst' },
            gehen:      { pr:['gehe','gehst','geht','gehen','geht','gehen'], pt:['ging','gingst','ging','gingen','gingt','gingen'], aux:'sein', p2:'gegangen' },
            kommen:     { pr:['komme','kommst','kommt','kommen','kommt','kommen'], pt:['kam','kamst','kam','kamen','kamt','kamen'], aux:'sein', p2:'gekommen' },
            sehen:      { pr:['sehe','siehst','sieht','sehen','seht','sehen'], pt:['sah','sahst','sah','sahen','saht','sahen'], aux:'haben', p2:'gesehen' },
            geben:      { pr:['gebe','gibst','gibt','geben','gebt','geben'], pt:['gab','gabst','gab','gaben','gabt','gaben'], aux:'haben', p2:'gegeben' },
            nehmen:     { pr:['nehme','nimmst','nimmt','nehmen','nehmt','nehmen'], pt:['nahm','nahmst','nahm','nahmen','nahmt','nahmen'], aux:'haben', p2:'genommen' },
            sprechen:   { pr:['spreche','sprichst','spricht','sprechen','sprecht','sprechen'], pt:['sprach','sprachst','sprach','sprachen','spracht','sprachen'], aux:'haben', p2:'gesprochen' },
            essen:      { pr:['esse','isst','isst','essen','esst','essen'], pt:['aß','aßt','aß','aßen','aßt','aßen'], aux:'haben', p2:'gegessen' },
            lesen:      { pr:['lese','liest','liest','lesen','lest','lesen'], pt:['las','last','las','lasen','last','lasen'], aux:'haben', p2:'gelesen' },
            fahren:     { pr:['fahre','fährst','fährt','fahren','fahrt','fahren'], pt:['fuhr','fuhrst','fuhr','fuhren','fuhrt','fuhren'], aux:'sein', p2:'gefahren' },
            finden:     { pr:['finde','findest','findet','finden','findet','finden'], pt:['fand','fandest','fand','fanden','fandet','fanden'], aux:'haben', p2:'gefunden' },
            schlafen:   { pr:['schlafe','schläfst','schläft','schlafen','schlaft','schlafen'], pt:['schlief','schliefst','schlief','schliefen','schlieft','schliefen'], aux:'haben', p2:'geschlafen' },
            schreiben:  { pr:['schreibe','schreibst','schreibt','schreiben','schreibt','schreiben'], pt:['schrieb','schriebst','schrieb','schrieben','schriebt','schrieben'], aux:'haben', p2:'geschrieben' },
            sitzen:     { pr:['sitze','sitzt','sitzt','sitzen','sitzt','sitzen'], pt:['saß','saßt','saß','saßen','saßt','saßen'], aux:'haben', p2:'gesessen' },
            stehen:     { pr:['stehe','stehst','steht','stehen','steht','stehen'], pt:['stand','standest','stand','standen','standet','standen'], aux:'haben', p2:'gestanden' },
            tragen:     { pr:['trage','trägst','trägt','tragen','tragt','tragen'], pt:['trug','trugst','trug','trugen','trugt','trugen'], aux:'haben', p2:'getragen' },
            trinken:    { pr:['trinke','trinkst','trinkt','trinken','trinkt','trinken'], pt:['trank','trankst','trank','tranken','trankt','tranken'], aux:'haben', p2:'getrunken' },
            tun:        { pr:['tue','tust','tut','tun','tut','tun'], pt:['tat','tatest','tat','taten','tatet','taten'], aux:'haben', p2:'getan' },
            bleiben:    { pr:['bleibe','bleibst','bleibt','bleiben','bleibt','bleiben'], pt:['blieb','bliebst','blieb','blieben','bliebt','blieben'], aux:'sein', p2:'geblieben' },
            heissen:    { pr:['heiße','heißt','heißt','heißen','heißt','heißen'], pt:['hieß','hießt','hieß','hießen','hießt','hießen'], aux:'haben', p2:'geheißen' },
            liegen:     { pr:['liege','liegst','liegt','liegen','liegt','liegen'], pt:['lag','lagst','lag','lagen','lagt','lagen'], aux:'haben', p2:'gelegen' },
            laufen:     { pr:['laufe','läufst','läuft','laufen','lauft','laufen'], pt:['lief','liefst','lief','liefen','lieft','liefen'], aux:'sein', p2:'gelaufen' },
            helfen:     { pr:['helfe','hilfst','hilft','helfen','helft','helfen'], pt:['half','halfst','half','halfen','halft','halfen'], aux:'haben', p2:'geholfen' },
            denken:     { pr:['denke','denkst','denkt','denken','denkt','denken'], pt:['dachte','dachtest','dachte','dachten','dachtet','dachten'], aux:'haben', p2:'gedacht' },
            bringen:    { pr:['bringe','bringst','bringt','bringen','bringt','bringen'], pt:['brachte','brachtest','brachte','brachten','brachtet','brachten'], aux:'haben', p2:'gebracht' },
            kennen:     { pr:['kenne','kennst','kennt','kennen','kennt','kennen'], pt:['kannte','kanntest','kannte','kannten','kanntet','kannten'], aux:'haben', p2:'gekannt' },
            nennen:     { pr:['nenne','nennst','nennt','nennen','nennt','nennen'], pt:['nannte','nanntest','nannte','nannten','nanntet','nannten'], aux:'haben', p2:'genannt' },
            vergessen:  { pr:['vergesse','vergisst','vergisst','vergessen','vergesst','vergessen'], pt:['vergaß','vergaßt','vergaß','vergaßen','vergaßt','vergaßen'], aux:'haben', p2:'vergessen' },
            verstehen:  { pr:['verstehe','verstehst','versteht','verstehen','versteht','verstehen'], pt:['verstand','verstandest','verstand','verstanden','verstandet','verstanden'], aux:'haben', p2:'verstanden' },
            werfen:     { pr:['werfe','wirfst','wirft','werfen','werft','werfen'], pt:['warf','warfst','warf','warfen','warft','warfen'], aux:'haben', p2:'geworfen' },
            ziehen:     { pr:['ziehe','ziehst','zieht','ziehen','zieht','ziehen'], pt:['zog','zogst','zog','zogen','zogt','zogen'], aux:'haben', p2:'gezogen' },
            rufen:      { pr:['rufe','rufst','ruft','rufen','ruft','rufen'], pt:['rief','riefst','rief','riefen','rieft','riefen'], aux:'haben', p2:'gerufen' },
            schliessen: { pr:['schließe','schließt','schließt','schließen','schließt','schließen'], pt:['schloss','schlossest','schloss','schlossen','schlosst','schlossen'], aux:'haben', p2:'geschlossen' },
            treffen:    { pr:['treffe','triffst','trifft','treffen','trefft','treffen'], pt:['traf','trafst','traf','trafen','traft','trafen'], aux:'haben', p2:'getroffen' },
            beginnen:   { pr:['beginne','beginnst','beginnt','beginnen','beginnt','beginnen'], pt:['begann','begannst','begann','begannen','begannt','begannen'], aux:'haben', p2:'begonnen' },
            verlieren:  { pr:['verliere','verlierst','verliert','verlieren','verliert','verlieren'], pt:['verlor','verlorst','verlor','verloren','verlort','verloren'], aux:'haben', p2:'verloren' },
            gewinnen:   { pr:['gewinne','gewinnst','gewinnt','gewinnen','gewinnt','gewinnen'], pt:['gewann','gewannst','gewann','gewannen','gewannt','gewannen'], aux:'haben', p2:'gewonnen' },
            fliegen:    { pr:['fliege','fliegst','fliegt','fliegen','fliegt','fliegen'], pt:['flog','flogst','flog','flogen','flogt','flogen'], aux:'sein', p2:'geflogen' },
            schwimmen:  { pr:['schwimme','schwimmst','schwimmt','schwimmen','schwimmt','schwimmen'], pt:['schwamm','schwammst','schwamm','schwammen','schwammt','schwammen'], aux:'sein', p2:'geschwommen' },

            backen:     { pr:['backe','bäckst','bäckt','backen','backt','backen'], pt:['backte','backtest','backte','backten','backtet','backten'], aux:'haben', p2:'gebacken' },
            befehlen:   { pr:['befehle','befiehlst','befiehlt','befehlen','befehlt','befehlen'], pt:['befahl','befahlst','befahl','befahlen','befahlt','befahlen'], aux:'haben', p2:'befohlen' },
            beissen:    { pr:['beiße','beißt','beißt','beißen','beißt','beißen'], pt:['biss','bisst','biss','bissen','bisst','bissen'], aux:'haben', p2:'gebissen' },
            bergen:     { pr:['berge','birgst','birgt','bergen','bergt','bergen'], pt:['barg','bargst','barg','bargen','bargt','bargen'], aux:'haben', p2:'geborgen' },
            bersten:    { pr:['berste','birst','birst','bersten','berstet','bersten'], pt:['barst','barstest','barst','barsten','barstet','barsten'], aux:'sein', p2:'geborsten' },
            biegen:     { pr:['biege','biegst','biegt','biegen','biegt','biegen'], pt:['bog','bogst','bog','bogen','bogt','bogen'], aux:'haben', p2:'gebogen' },
            bieten:     { pr:['biete','bietest','bietet','bieten','bietet','bieten'], pt:['bot','botst','bot','boten','botet','boten'], aux:'haben', p2:'geboten' },
            binden:     { pr:['binde','bindest','bindet','binden','bindet','binden'], pt:['band','bandest','band','banden','bandet','banden'], aux:'haben', p2:'gebunden' },
            bitten:     { pr:['bitte','bittest','bittet','bitten','bittet','bitten'], pt:['bat','batst','bat','baten','batet','baten'], aux:'haben', p2:'gebeten' },
            blasen:     { pr:['blase','bläst','bläst','blasen','blast','blasen'], pt:['blies','bliesest','blies','bliesen','bliest','bliesen'], aux:'haben', p2:'geblasen' },
            braten:     { pr:['brate','brätst','brät','braten','bratet','braten'], pt:['briet','brietst','briet','brieten','brietet','brieten'], aux:'haben', p2:'gebraten' },
            brechen:    { pr:['breche','brichst','bricht','brechen','brecht','brechen'], pt:['brach','brachst','brach','brachen','bracht','brachen'], aux:'haben', p2:'gebrochen' },
            dringen:    { pr:['dringe','dringst','dringt','dringen','dringt','dringen'], pt:['drang','drangst','drang','drangen','drangt','drangen'], aux:'sein', p2:'gedrungen' },
            empfangen:  { pr:['empfange','empfängst','empfängt','empfangen','empfangt','empfangen'], pt:['empfing','empfingst','empfing','empfingen','empfingt','empfingen'], aux:'haben', p2:'empfangen' },
            empfehlen:  { pr:['empfehle','empfiehlst','empfiehlt','empfehlen','empfehlt','empfehlen'], pt:['empfahl','empfahlst','empfahl','empfahlen','empfahlt','empfahlen'], aux:'haben', p2:'empfohlen' },
            empfinden:  { pr:['empfinde','empfindest','empfindet','empfinden','empfindet','empfinden'], pt:['empfand','empfandest','empfand','empfanden','empfandet','empfanden'], aux:'haben', p2:'empfunden' },
            erschrecken:{ pr:['erschrecke','erschrickst','erschrickt','erschrecken','erschreckt','erschrecken'], pt:['erschrak','erschrakst','erschrak','erschraken','erschrakt','erschraken'], aux:'sein', p2:'erschrocken' },
            fallen:     { pr:['falle','fällst','fällt','fallen','fallt','fallen'], pt:['fiel','fielst','fiel','fielen','fielt','fielen'], aux:'sein', p2:'gefallen' },
            fangen:     { pr:['fange','fängst','fängt','fangen','fangt','fangen'], pt:['fing','fingst','fing','fingen','fingt','fingen'], aux:'haben', p2:'gefangen' },
            fliehen:    { pr:['fliehe','fliehst','flieht','fliehen','flieht','fliehen'], pt:['floh','flohst','floh','flohen','floht','flohen'], aux:'sein', p2:'geflohen' },
            fliessen:   { pr:['fließe','fließt','fließt','fließen','fließt','fließen'], pt:['floss','flossest','floss','flossen','flosst','flossen'], aux:'sein', p2:'geflossen' },
            fressen:    { pr:['fresse','frisst','frisst','fressen','fresst','fressen'], pt:['fraß','fraßt','fraß','fraßen','fraßt','fraßen'], aux:'haben', p2:'gefressen' },
            frieren:    { pr:['friere','frierst','friert','frieren','friert','frieren'], pt:['fror','frorst','fror','froren','frort','froren'], aux:'haben', p2:'gefroren' },
            gebaeren:   { pr:['gebäre','gebierst','gebiert','gebären','gebärt','gebären'], pt:['gebar','gebarst','gebar','gebaren','gebart','gebaren'], aux:'haben', p2:'geboren' },
            gedeihen:   { pr:['gedeihe','gedeihst','gedeiht','gedeihen','gedeiht','gedeihen'], pt:['gedieh','gediehst','gedieh','gediehen','gedieht','gediehen'], aux:'sein', p2:'gediehen' },
            gefallen:   { pr:['gefalle','gefällst','gefällt','gefallen','gefallt','gefallen'], pt:['gefiel','gefielst','gefiel','gefielen','gefielt','gefielen'], aux:'haben', p2:'gefallen' },
            gelingen:   { pr:['gelinge','gelingst','gelingt','gelingen','gelingt','gelingen'], pt:['gelang','gelangst','gelang','gelangen','gelangt','gelangen'], aux:'sein', p2:'gelungen' },
            gelten:     { pr:['gelte','giltst','gilt','gelten','geltet','gelten'], pt:['galt','galtst','galt','galten','galtet','galten'], aux:'haben', p2:'gegolten' },
            genesen:    { pr:['genese','genest','genest','genesen','genest','genesen'], pt:['genas','genasest','genas','genasen','genast','genasen'], aux:'sein', p2:'genesen' },
            geniessen:  { pr:['genieße','genießt','genießt','genießen','genießt','genießen'], pt:['genoss','genossest','genoss','genossen','genosst','genossen'], aux:'haben', p2:'genossen' },
            geschehen:  { pr:['geschehe','geschiehst','geschieht','geschehen','geschehet','geschehen'], pt:['geschah','geschahst','geschah','geschahen','geschaht','geschahen'], aux:'sein', p2:'geschehen' },
            giessen:    { pr:['gieße','gießt','gießt','gießen','gießt','gießen'], pt:['goss','gossest','goss','gossen','gosst','gossen'], aux:'haben', p2:'gegossen' },
            gleichen:   { pr:['gleiche','gleichst','gleicht','gleichen','gleicht','gleichen'], pt:['glich','glichst','glich','glichen','glicht','glichen'], aux:'haben', p2:'geglichen' },
            gleiten:    { pr:['gleite','gleitest','gleitet','gleiten','gleitet','gleiten'], pt:['glitt','glittest','glitt','glitten','glittet','glitten'], aux:'sein', p2:'geglitten' },
            graben:     { pr:['grabe','gräbst','gräbt','graben','grabt','graben'], pt:['grub','grubst','grub','gruben','grubt','gruben'], aux:'haben', p2:'gegraben' },
            greifen:    { pr:['greife','greifst','greift','greifen','greift','greifen'], pt:['griff','griffst','griff','griffen','grifft','griffen'], aux:'haben', p2:'gegriffen' },
            halten:     { pr:['halte','hältst','hält','halten','haltet','halten'], pt:['hielt','hieltst','hielt','hielten','hieltet','hielten'], aux:'haben', p2:'gehalten' },
            haengen:    { pr:['hänge','hängst','hängt','hängen','hängt','hängen'], pt:['hing','hingst','hing','hingen','hingt','hingen'], aux:'haben', p2:'gehangen' },
            hauen:      { pr:['haue','haust','haut','hauen','haut','hauen'], pt:['hieb','hiebst','hieb','hieben','hiebt','hieben'], aux:'haben', p2:'gehauen' },
            heben:      { pr:['hebe','hebst','hebt','heben','hebt','heben'], pt:['hob','hobst','hob','hoben','hobt','hoben'], aux:'haben', p2:'gehoben' },
            klingen:    { pr:['klinge','klingst','klingt','klingen','klingt','klingen'], pt:['klang','klangst','klang','klangen','klangt','klangen'], aux:'haben', p2:'geklungen' },
            kneifen:    { pr:['kneife','kneifst','kneift','kneifen','kneift','kneifen'], pt:['kniff','kniffst','kniff','kniffen','knifft','kniffen'], aux:'haben', p2:'gekniffen' },
            kriechen:   { pr:['krieche','kriechst','kriecht','kriechen','kriecht','kriechen'], pt:['kroch','krochst','kroch','krochen','krocht','krochen'], aux:'sein', p2:'gekrochen' },
            laden:      { pr:['lade','lädst','lädt','laden','ladet','laden'], pt:['lud','ludst','lud','luden','ludet','luden'], aux:'haben', p2:'geladen' },
            lassen:     { pr:['lasse','lässt','lässt','lassen','lasst','lassen'], pt:['ließ','ließt','ließ','ließen','ließt','ließen'], aux:'haben', p2:'gelassen' },
            leiden:     { pr:['leide','leidest','leidet','leiden','leidet','leiden'], pt:['litt','littest','litt','litten','littet','litten'], aux:'haben', p2:'gelitten' },
            leihen:     { pr:['leihe','leihst','leiht','leihen','leiht','leihen'], pt:['lieh','liehst','lieh','liehen','lieht','liehen'], aux:'haben', p2:'geliehen' },
            luegen:     { pr:['lüge','lügst','lügt','lügen','lügt','lügen'], pt:['log','logst','log','logen','logt','logen'], aux:'haben', p2:'gelogen' },
            meiden:     { pr:['meide','meidest','meidet','meiden','meidet','meiden'], pt:['mied','miedst','mied','mieden','miedet','mieden'], aux:'haben', p2:'gemieden' },
            messen:     { pr:['messe','misst','misst','messen','messt','messen'], pt:['maß','maßt','maß','maßen','maßt','maßen'], aux:'haben', p2:'gemessen' },
            pfeifen:    { pr:['pfeife','pfeifst','pfeift','pfeifen','pfeift','pfeifen'], pt:['pfiff','pfiffst','pfiff','pfiffen','pfifft','pfiffen'], aux:'haben', p2:'gepfiffen' },
            preisen:    { pr:['preise','preist','preist','preisen','preist','preisen'], pt:['pries','priesest','pries','priesen','priest','priesen'], aux:'haben', p2:'gepriesen' },
            quellen:    { pr:['quelle','quillst','quillt','quellen','quellt','quellen'], pt:['quoll','quollst','quoll','quollen','quollt','quollen'], aux:'sein', p2:'gequollen' },
            raten:      { pr:['rate','rätst','rät','raten','ratet','raten'], pt:['riet','rietst','riet','rieten','rietet','rieten'], aux:'haben', p2:'geraten' },
            reiben:     { pr:['reibe','reibst','reibt','reiben','reibt','reiben'], pt:['rieb','riebst','rieb','rieben','riebt','rieben'], aux:'haben', p2:'gerieben' },
            reissen:    { pr:['reiße','reißt','reißt','reißen','reißt','reißen'], pt:['riss','rissest','riss','rissen','risst','rissen'], aux:'haben', p2:'gerissen' },
            reiten:     { pr:['reite','reitest','reitet','reiten','reitet','reiten'], pt:['ritt','rittest','ritt','ritten','rittet','ritten'], aux:'sein', p2:'geritten' },
            rennen:     { pr:['renne','rennst','rennt','rennen','rennt','rennen'], pt:['rannte','ranntest','rannte','rannten','ranntet','rannten'], aux:'sein', p2:'gerannt' },
            riechen:    { pr:['rieche','riechst','riecht','riechen','riecht','riechen'], pt:['roch','rochst','roch','rochen','rocht','rochen'], aux:'haben', p2:'gerochen' },
            ringen:     { pr:['ringe','ringst','ringt','ringen','ringt','ringen'], pt:['rang','rangst','rang','rangen','rangt','rangen'], aux:'haben', p2:'gerungen' },
            rinnen:     { pr:['rinne','rinnst','rinnt','rinnen','rinnt','rinnen'], pt:['rann','rannst','rann','rannen','rannt','rannen'], aux:'sein', p2:'geronnen' },
            saufen:     { pr:['saufe','säufst','säuft','saufen','sauft','saufen'], pt:['soff','soffst','soff','soffen','sofft','soffen'], aux:'haben', p2:'gesoffen' },
            saugen:     { pr:['sauge','saugst','saugt','saugen','saugt','saugen'], pt:['sog','sogst','sog','sogen','sogt','sogen'], aux:'haben', p2:'gesogen' },
            schaffen:   { pr:['schaffe','schaffst','schafft','schaffen','schafft','schaffen'], pt:['schuf','schufst','schuf','schufen','schuft','schufen'], aux:'haben', p2:'geschaffen' },
            scheiden:   { pr:['scheide','scheidest','scheidet','scheiden','scheidet','scheiden'], pt:['schied','schiedst','schied','schieden','schiedet','schieden'], aux:'haben', p2:'geschieden' },
            scheinen:   { pr:['scheine','scheinst','scheint','scheinen','scheint','scheinen'], pt:['schien','schienst','schien','schienen','schient','schienen'], aux:'haben', p2:'geschienen' },
            schelten:   { pr:['schelte','schiltst','schilt','schelten','scheltet','schelten'], pt:['schalt','schaltst','schalt','schalten','schaltet','schalten'], aux:'haben', p2:'gescholten' },
            scheren:    { pr:['schere','scherst','schert','scheren','schert','scheren'], pt:['schor','schorst','schor','schoren','schort','schoren'], aux:'haben', p2:'geschoren' },
            schieben:   { pr:['schiebe','schiebst','schiebt','schieben','schiebt','schieben'], pt:['schob','schobst','schob','schoben','schobt','schoben'], aux:'haben', p2:'geschoben' },
            schiessen:  { pr:['schieße','schießt','schießt','schießen','schießt','schießen'], pt:['schoss','schossest','schoss','schossen','schosst','schossen'], aux:'haben', p2:'geschossen' },
            schlagen:   { pr:['schlage','schlägst','schlägt','schlagen','schlagt','schlagen'], pt:['schlug','schlugst','schlug','schlugen','schlugt','schlugen'], aux:'haben', p2:'geschlagen' },
            schleichen: { pr:['schleiche','schleichst','schleicht','schleichen','schleicht','schleichen'], pt:['schlich','schlichst','schlich','schlichen','schlicht','schlichen'], aux:'sein', p2:'geschlichen' },
            schmeissen: { pr:['schmeiße','schmeißt','schmeißt','schmeißen','schmeißt','schmeißen'], pt:['schmiss','schmissest','schmiss','schmissen','schmisst','schmissen'], aux:'haben', p2:'geschmissen' },
            schmelzen:  { pr:['schmelze','schmilzt','schmilzt','schmelzen','schmelzt','schmelzen'], pt:['schmolz','schmolzest','schmolz','schmolzen','schmolzt','schmolzen'], aux:'sein', p2:'geschmolzen' },
            schneiden:  { pr:['schneide','schneidest','schneidet','schneiden','schneidet','schneiden'], pt:['schnitt','schnittest','schnitt','schnitten','schnittet','schnitten'], aux:'haben', p2:'geschnitten' },
            schreien:   { pr:['schreie','schreist','schreit','schreien','schreit','schreien'], pt:['schrie','schriest','schrie','schrien','schriet','schrien'], aux:'haben', p2:'geschrien' },
            schreiten:  { pr:['schreite','schreitest','schreitet','schreiten','schreitet','schreiten'], pt:['schritt','schrittest','schritt','schritten','schrittet','schritten'], aux:'sein', p2:'geschritten' },
            schweigen:  { pr:['schweige','schweigst','schweigt','schweigen','schweigt','schweigen'], pt:['schwieg','schwiegst','schwieg','schwiegen','schwiegt','schwiegen'], aux:'haben', p2:'geschwiegen' },
            schwellen:  { pr:['schwelle','schwillst','schwillt','schwellen','schwellt','schwellen'], pt:['schwoll','schwollst','schwoll','schwollen','schwollt','schwollen'], aux:'sein', p2:'geschwollen' },
            schwinden:  { pr:['schwinde','schwindest','schwindet','schwinden','schwindet','schwinden'], pt:['schwand','schwandest','schwand','schwanden','schwandet','schwanden'], aux:'sein', p2:'geschwunden' },
            schwingen:  { pr:['schwinge','schwingst','schwingt','schwingen','schwingt','schwingen'], pt:['schwang','schwangst','schwang','schwangen','schwangt','schwangen'], aux:'haben', p2:'geschwungen' },
            schwoeren:  { pr:['schwöre','schwörst','schwört','schwören','schwört','schwören'], pt:['schwor','schworst','schwor','schworen','schwort','schworen'], aux:'haben', p2:'geschworen' },
            senden:     { pr:['sende','sendest','sendet','senden','sendet','senden'], pt:['sandte','sandtest','sandte','sandten','sandtet','sandten'], aux:'haben', p2:'gesandt' },
            singen:     { pr:['singe','singst','singt','singen','singt','singen'], pt:['sang','sangst','sang','sangen','sangt','sangen'], aux:'haben', p2:'gesungen' },
            sinken:     { pr:['sinke','sinkst','sinkt','sinken','sinkt','sinken'], pt:['sank','sankst','sank','sanken','sankt','sanken'], aux:'sein', p2:'gesunken' },
            sinnen:     { pr:['sinne','sinnst','sinnt','sinnen','sinnt','sinnen'], pt:['sann','sannst','sann','sannen','sannt','sannen'], aux:'haben', p2:'gesonnen' },
            spalten:    { pr:['spalte','spaltest','spaltet','spalten','spaltet','spalten'], pt:['spaltete','spaltetest','spaltete','spalteten','spaltetet','spalteten'], aux:'haben', p2:'gespalten' },
            speien:     { pr:['speie','speist','speit','speien','speit','speien'], pt:['spie','spiest','spie','spien','spiet','spien'], aux:'haben', p2:'gespien' },
            spinnen:    { pr:['spinne','spinnst','spinnt','spinnen','spinnt','spinnen'], pt:['spann','spannst','spann','spannen','spannt','spannen'], aux:'haben', p2:'gesponnen' },
            spriessen:  { pr:['sprieße','sprießt','sprießt','sprießen','sprießt','sprießen'], pt:['spross','sprossest','spross','sprossen','sprosst','sprossen'], aux:'sein', p2:'gesprossen' },
            springen:   { pr:['springe','springst','springt','springen','springt','springen'], pt:['sprang','sprangst','sprang','sprangen','sprangt','sprangen'], aux:'sein', p2:'gesprungen' },
            stechen:    { pr:['steche','stichst','sticht','stechen','stecht','stechen'], pt:['stach','stachst','stach','stachen','stacht','stachen'], aux:'haben', p2:'gestochen' },
            stehlen:    { pr:['stehle','stiehlst','stiehlt','stehlen','stehlt','stehlen'], pt:['stahl','stahlst','stahl','stahlen','stahlt','stahlen'], aux:'haben', p2:'gestohlen' },
            steigen:    { pr:['steige','steigst','steigt','steigen','steigt','steigen'], pt:['stieg','stiegst','stieg','stiegen','stiegt','stiegen'], aux:'sein', p2:'gestiegen' },
            sterben:    { pr:['sterbe','stirbst','stirbt','sterben','sterbt','sterben'], pt:['starb','starbst','starb','starben','starbt','starben'], aux:'sein', p2:'gestorben' },
            stinken:    { pr:['stinke','stinkst','stinkt','stinken','stinkt','stinken'], pt:['stank','stankst','stank','stanken','stankt','stanken'], aux:'haben', p2:'gestunken' },
            stossen:    { pr:['stoße','stößt','stößt','stoßen','stoßt','stoßen'], pt:['stieß','stießt','stieß','stießen','stießt','stießen'], aux:'haben', p2:'gestoßen' },
            streichen:  { pr:['streiche','streichst','streicht','streichen','streicht','streichen'], pt:['strich','strichst','strich','strichen','stricht','strichen'], aux:'haben', p2:'gestrichen' },
            streiten:   { pr:['streite','streitest','streitet','streiten','streitet','streiten'], pt:['stritt','strittest','stritt','stritten','strittet','stritten'], aux:'haben', p2:'gestritten' },
            treiben:    { pr:['treibe','treibst','treibt','treiben','treibt','treiben'], pt:['trieb','triebst','trieb','trieben','triebt','trieben'], aux:'haben', p2:'getrieben' },
            treten:     { pr:['trete','trittst','tritt','treten','tretet','treten'], pt:['trat','tratst','trat','traten','tratet','traten'], aux:'sein', p2:'getreten' },
            truegen:    { pr:['trüge','trügst','trügt','trügen','trügt','trügen'], pt:['trog','trogst','trog','trogen','trogt','trogen'], aux:'haben', p2:'getrogen' },
            verderben:  { pr:['verderbe','verdirbst','verdirbt','verderben','verderbt','verderben'], pt:['verdarb','verdarbst','verdarb','verdarben','verdarbt','verdarben'], aux:'sein', p2:'verdorben' },
            verzeihen:  { pr:['verzeihe','verzeihst','verzeiht','verzeihen','verzeiht','verzeihen'], pt:['verzieh','verziehst','verzieh','verziehen','verzieht','verziehen'], aux:'haben', p2:'verziehen' },
            wachsen:    { pr:['wachse','wächst','wächst','wachsen','wachst','wachsen'], pt:['wuchs','wuchsest','wuchs','wuchsen','wuchst','wuchsen'], aux:'sein', p2:'gewachsen' },
            waschen:    { pr:['wasche','wäschst','wäscht','waschen','wascht','waschen'], pt:['wusch','wuschst','wusch','wuschen','wuscht','wuschen'], aux:'haben', p2:'gewaschen' },
            weichen:    { pr:['weiche','weichst','weicht','weichen','weicht','weichen'], pt:['wich','wichst','wich','wichen','wicht','wichen'], aux:'sein', p2:'gewichen' },
            weisen:     { pr:['weise','weist','weist','weisen','weist','weisen'], pt:['wies','wiesest','wies','wiesen','wiest','wiesen'], aux:'haben', p2:'gewiesen' },
            wenden:     { pr:['wende','wendest','wendet','wenden','wendet','wenden'], pt:['wandte','wandtest','wandte','wandten','wandtet','wandten'], aux:'haben', p2:'gewandt' },
            werben:     { pr:['werbe','wirbst','wirbt','werben','werbt','werben'], pt:['warb','warbst','warb','warben','warbt','warben'], aux:'haben', p2:'geworben' },
            wiegen:     { pr:['wiege','wiegst','wiegt','wiegen','wiegt','wiegen'], pt:['wog','wogst','wog','wogen','wogt','wogen'], aux:'haben', p2:'gewogen' },
            winden:     { pr:['winde','windest','windet','winden','windet','winden'], pt:['wand','wandest','wand','wanden','wandet','wanden'], aux:'haben', p2:'gewunden' },
            zwingen:    { pr:['zwinge','zwingst','zwingt','zwingen','zwingt','zwingen'], pt:['zwang','zwangst','zwang','zwangen','zwangt','zwangen'], aux:'haben', p2:'gezwungen' },

            bekommen:     { pr:['bekomme','bekommst','bekommt','bekommen','bekommt','bekommen'], pt:['bekam','bekamst','bekam','bekamen','bekamt','bekamen'], aux:'haben', p2:'bekommen' },
            entstehen:    { pr:['entstehe','entstehst','entsteht','entstehen','entsteht','entstehen'], pt:['entstand','entstandest','entstand','entstanden','entstandet','entstanden'], aux:'sein', p2:'entstanden' },
            erhalten:     { pr:['erhalte','erhältst','erhält','erhalten','erhaltet','erhalten'], pt:['erhielt','erhieltst','erhielt','erhielten','erhieltet','erhielten'], aux:'haben', p2:'erhalten' },
            verlassen:    { pr:['verlasse','verlässt','verlässt','verlassen','verlasst','verlassen'], pt:['verließ','verließt','verließ','verließen','verließt','verließen'], aux:'haben', p2:'verlassen' },
            versprechen:  { pr:['verspreche','versprichst','verspricht','versprechen','versprecht','versprechen'], pt:['versprach','versprachst','versprach','versprachen','verspracht','versprachen'], aux:'haben', p2:'versprochen' },
            beschreiben:  { pr:['beschreibe','beschreibst','beschreibt','beschreiben','beschreibt','beschreiben'], pt:['beschrieb','beschriebst','beschrieb','beschrieben','beschriebt','beschrieben'], aux:'haben', p2:'beschrieben' },
            besprechen:   { pr:['bespreche','besprichst','bespricht','besprechen','besprecht','besprechen'], pt:['besprach','besprachst','besprach','besprachen','bespracht','besprachen'], aux:'haben', p2:'besprochen' },
            betreten:     { pr:['betrete','betrittst','betritt','betreten','betretet','betreten'], pt:['betrat','betratst','betrat','betraten','betratet','betraten'], aux:'haben', p2:'betreten' },
            begreifen:    { pr:['begreife','begreifst','begreift','begreifen','begreift','begreifen'], pt:['begriff','begriffst','begriff','begriffen','begrifft','begriffen'], aux:'haben', p2:'begriffen' },
            entscheiden:  { pr:['entscheide','entscheidest','entscheidet','entscheiden','entscheidet','entscheiden'], pt:['entschied','entschiedst','entschied','entschieden','entschiedet','entschieden'], aux:'haben', p2:'entschieden' },
            erfahren:     { pr:['erfahre','erfährst','erfährt','erfahren','erfahrt','erfahren'], pt:['erfuhr','erfuhrst','erfuhr','erfuhren','erfuhrt','erfuhren'], aux:'haben', p2:'erfahren' },
            erkennen:     { pr:['erkenne','erkennst','erkennt','erkennen','erkennt','erkennen'], pt:['erkannte','erkanntest','erkannte','erkannten','erkanntet','erkannten'], aux:'haben', p2:'erkannt' },
            vergeben:     { pr:['vergebe','vergibst','vergibt','vergeben','vergebt','vergeben'], pt:['vergab','vergabst','vergab','vergaben','vergabt','vergaben'], aux:'haben', p2:'vergeben' },
            zerbrechen:   { pr:['zerbreche','zerbrichst','zerbricht','zerbrechen','zerbrecht','zerbrechen'], pt:['zerbrach','zerbrachst','zerbrach','zerbrachen','zerbracht','zerbrachen'], aux:'sein', p2:'zerbrochen' },

            ankommen:     { pr:['komme an','kommst an','kommt an','kommen an','kommt an','kommen an'], pt:['kam an','kamst an','kam an','kamen an','kamt an','kamen an'], aux:'sein', p2:'angekommen' },
            aufstehen:    { pr:['stehe auf','stehst auf','steht auf','stehen auf','steht auf','stehen auf'], pt:['stand auf','standest auf','stand auf','standen auf','standet auf','standen auf'], aux:'sein', p2:'aufgestanden' },
            einsteigen:   { pr:['steige ein','steigst ein','steigt ein','steigen ein','steigt ein','steigen ein'], pt:['stieg ein','stiegst ein','stieg ein','stiegen ein','stiegt ein','stiegen ein'], aux:'sein', p2:'eingestiegen' },
            aussteigen:   { pr:['steige aus','steigst aus','steigt aus','steigen aus','steigt aus','steigen aus'], pt:['stieg aus','stiegst aus','stieg aus','stiegen aus','stiegt aus','stiegen aus'], aux:'sein', p2:'ausgestiegen' },
            anfangen:     { pr:['fange an','fängst an','fängt an','fangen an','fangt an','fangen an'], pt:['fing an','fingst an','fing an','fingen an','fingt an','fingen an'], aux:'haben', p2:'angefangen' },
            anrufen:      { pr:['rufe an','rufst an','ruft an','rufen an','ruft an','rufen an'], pt:['rief an','riefst an','rief an','riefen an','rieft an','riefen an'], aux:'haben', p2:'angerufen' },
            vorschlagen:  { pr:['schlage vor','schlägst vor','schlägt vor','schlagen vor','schlagt vor','schlagen vor'], pt:['schlug vor','schlugst vor','schlug vor','schlugen vor','schlugt vor','schlugen vor'], aux:'haben', p2:'vorgeschlagen' },
            mitkommen:    { pr:['komme mit','kommst mit','kommt mit','kommen mit','kommt mit','kommen mit'], pt:['kam mit','kamst mit','kam mit','kamen mit','kamt mit','kamen mit'], aux:'sein', p2:'mitgekommen' },
            zurueckkommen:{ pr:['komme zurück','kommst zurück','kommt zurück','kommen zurück','kommt zurück','kommen zurück'], pt:['kam zurück','kamst zurück','kam zurück','kamen zurück','kamt zurück','kamen zurück'], aux:'sein', p2:'zurückgekommen' },


            'weggehen': { pr:['gehe weg','gehst weg','geht weg','gehen weg','geht weg','gehen weg'], pt:['ging weg','gingst weg','ging weg','gingen weg','gingt weg','gingen weg'], aux:'sein', p2:'weggegangen' },
            'ausgehen': { pr:['gehe aus','gehst aus','geht aus','gehen aus','geht aus','gehen aus'], pt:['ging aus','gingst aus','ging aus','gingen aus','gingt aus','gingen aus'], aux:'sein', p2:'ausgegangen' },
            'losgehen': { pr:['gehe los','gehst los','geht los','gehen los','geht los','gehen los'], pt:['ging los','gingst los','ging los','gingen los','gingt los','gingen los'], aux:'sein', p2:'losgegangen' },
            'weitergehen': { pr:['gehe weiter','gehst weiter','geht weiter','gehen weiter','geht weiter','gehen weiter'], pt:['ging weiter','gingst weiter','ging weiter','gingen weiter','gingt weiter','gingen weiter'], aux:'sein', p2:'weitergegangen' },
            'zurückgehen': { pr:['gehe zurück','gehst zurück','geht zurück','gehen zurück','geht zurück','gehen zurück'], pt:['ging zurück','gingst zurück','ging zurück','gingen zurück','gingt zurück','gingen zurück'], aux:'sein', p2:'zurückgegangen' },
            'untergehen': { pr:['gehe unter','gehst unter','geht unter','gehen unter','geht unter','gehen unter'], pt:['ging unter','gingst unter','ging unter','gingen unter','gingt unter','gingen unter'], aux:'sein', p2:'untergegangen' },
            'vorbeigehen': { pr:['gehe vorbei','gehst vorbei','geht vorbei','gehen vorbei','geht vorbei','gehen vorbei'], pt:['ging vorbei','gingst vorbei','ging vorbei','gingen vorbei','gingt vorbei','gingen vorbei'], aux:'sein', p2:'vorbeigegangen' },
            'hingehen': { pr:['gehe hin','gehst hin','geht hin','gehen hin','geht hin','gehen hin'], pt:['ging hin','gingst hin','ging hin','gingen hin','gingt hin','gingen hin'], aux:'sein', p2:'hingegangen' },
            'eingehen': { pr:['gehe ein','gehst ein','geht ein','gehen ein','geht ein','gehen ein'], pt:['ging ein','gingst ein','ging ein','gingen ein','gingt ein','gingen ein'], aux:'sein', p2:'eingegangen' },
            'wegkommen': { pr:['komme weg','kommst weg','kommt weg','kommen weg','kommt weg','kommen weg'], pt:['kam weg','kamst weg','kam weg','kamen weg','kamt weg','kamen weg'], aux:'sein', p2:'weggekommen' },
            'auskommen': { pr:['komme aus','kommst aus','kommt aus','kommen aus','kommt aus','kommen aus'], pt:['kam aus','kamst aus','kam aus','kamen aus','kamt aus','kamen aus'], aux:'sein', p2:'ausgekommen' },
            'vorbeikommen': { pr:['komme vorbei','kommst vorbei','kommt vorbei','kommen vorbei','kommt vorbei','kommen vorbei'], pt:['kam vorbei','kamst vorbei','kam vorbei','kamen vorbei','kamt vorbei','kamen vorbei'], aux:'sein', p2:'vorbeigekommen' },
            'zurechtkommen': { pr:['komme zurecht','kommst zurecht','kommt zurecht','kommen zurecht','kommt zurecht','kommen zurecht'], pt:['kam zurecht','kamst zurecht','kam zurecht','kamen zurecht','kamt zurecht','kamen zurecht'], aux:'sein', p2:'zurechtgekommen' },
            'weiterkommen': { pr:['komme weiter','kommst weiter','kommt weiter','kommen weiter','kommt weiter','kommen weiter'], pt:['kam weiter','kamst weiter','kam weiter','kamen weiter','kamt weiter','kamen weiter'], aux:'sein', p2:'weitergekommen' },
            'herauskommen': { pr:['komme heraus','kommst heraus','kommt heraus','kommen heraus','kommt heraus','kommen heraus'], pt:['kam heraus','kamst heraus','kam heraus','kamen heraus','kamt heraus','kamen heraus'], aux:'sein', p2:'herausgekommen' },
            'hereinkommen': { pr:['komme herein','kommst herein','kommt herein','kommen herein','kommt herein','kommen herein'], pt:['kam herein','kamst herein','kam herein','kamen herein','kamt herein','kamen herein'], aux:'sein', p2:'hereingekommen' },
            'zustehen': { pr:['stehe zu','stehst zu','steht zu','stehen zu','steht zu','stehen zu'], pt:['stand zu','standest zu','stand zu','standen zu','standet zu','standen zu'], aux:'haben', p2:'zugestanden' },
            'mitnehmen': { pr:['nehme mit','nimmst mit','nimmt mit','nehmen mit','nehmt mit','nehmen mit'], pt:['nahm mit','nahmst mit','nahm mit','nahmen mit','nahmt mit','nahmen mit'], aux:'haben', p2:'mitgenommen' },
            'abnehmen': { pr:['nehme ab','nimmst ab','nimmt ab','nehmen ab','nehmt ab','nehmen ab'], pt:['nahm ab','nahmst ab','nahm ab','nahmen ab','nahmt ab','nahmen ab'], aux:'haben', p2:'abgenommen' },
            'zunehmen': { pr:['nehme zu','nimmst zu','nimmt zu','nehmen zu','nehmt zu','nehmen zu'], pt:['nahm zu','nahmst zu','nahm zu','nahmen zu','nahmt zu','nahmen zu'], aux:'haben', p2:'zugenommen' },
            'wegnehmen': { pr:['nehme weg','nimmst weg','nimmt weg','nehmen weg','nehmt weg','nehmen weg'], pt:['nahm weg','nahmst weg','nahm weg','nahmen weg','nahmt weg','nahmen weg'], aux:'haben', p2:'weggenommen' },
            'teilnehmen': { pr:['nehme teil','nimmst teil','nimmt teil','nehmen teil','nehmt teil','nehmen teil'], pt:['nahm teil','nahmst teil','nahm teil','nahmen teil','nahmt teil','nahmen teil'], aux:'haben', p2:'teilgenommen' },
            'annehmen': { pr:['nehme an','nimmst an','nimmt an','nehmen an','nehmt an','nehmen an'], pt:['nahm an','nahmst an','nahm an','nahmen an','nahmt an','nahmen an'], aux:'haben', p2:'angenommen' },
            'aufnehmen': { pr:['nehme auf','nimmst auf','nimmt auf','nehmen auf','nehmt auf','nehmen auf'], pt:['nahm auf','nahmst auf','nahm auf','nahmen auf','nahmt auf','nahmen auf'], aux:'haben', p2:'aufgenommen' },
            'ausnehmen': { pr:['nehme aus','nimmst aus','nimmt aus','nehmen aus','nehmt aus','nehmen aus'], pt:['nahm aus','nahmst aus','nahm aus','nahmen aus','nahmt aus','nahmen aus'], aux:'haben', p2:'ausgenommen' },
            'vornehmen': { pr:['nehme vor','nimmst vor','nimmt vor','nehmen vor','nehmt vor','nehmen vor'], pt:['nahm vor','nahmst vor','nahm vor','nahmen vor','nahmt vor','nahmen vor'], aux:'haben', p2:'vorgenommen' },
            'abgeben': { pr:['gebe ab','gibst ab','gibt ab','geben ab','gebt ab','geben ab'], pt:['gab ab','gabst ab','gab ab','gaben ab','gabt ab','gaben ab'], aux:'haben', p2:'abgegeben' },
            'angeben': { pr:['gebe an','gibst an','gibt an','geben an','gebt an','geben an'], pt:['gab an','gabst an','gab an','gaben an','gabt an','gaben an'], aux:'haben', p2:'angegeben' },
            'aufgeben': { pr:['gebe auf','gibst auf','gibt auf','geben auf','gebt auf','geben auf'], pt:['gab auf','gabst auf','gab auf','gaben auf','gabt auf','gaben auf'], aux:'haben', p2:'aufgegeben' },
            'ausgeben': { pr:['gebe aus','gibst aus','gibt aus','geben aus','gebt aus','geben aus'], pt:['gab aus','gabst aus','gab aus','gaben aus','gabt aus','gaben aus'], aux:'haben', p2:'ausgegeben' },
            'eingeben': { pr:['gebe ein','gibst ein','gibt ein','geben ein','gebt ein','geben ein'], pt:['gab ein','gabst ein','gab ein','gaben ein','gabt ein','gaben ein'], aux:'haben', p2:'eingegeben' },
            'weitergeben': { pr:['gebe weiter','gibst weiter','gibt weiter','geben weiter','gebt weiter','geben weiter'], pt:['gab weiter','gabst weiter','gab weiter','gaben weiter','gabt weiter','gaben weiter'], aux:'haben', p2:'weitergegeben' },
            'zurückgeben': { pr:['gebe zurück','gibst zurück','gibt zurück','geben zurück','gebt zurück','geben zurück'], pt:['gab zurück','gabst zurück','gab zurück','gaben zurück','gabt zurück','gaben zurück'], aux:'haben', p2:'zurückgegeben' },
            'vorgeben': { pr:['gebe vor','gibst vor','gibt vor','geben vor','gebt vor','geben vor'], pt:['gab vor','gabst vor','gab vor','gaben vor','gabt vor','gaben vor'], aux:'haben', p2:'vorgegeben' },
            'aussehen': { pr:['sehe aus','siehst aus','sieht aus','sehen aus','seht aus','sehen aus'], pt:['sah aus','sahst aus','sah aus','sahen aus','saht aus','sahen aus'], aux:'haben', p2:'ausgesehen' },
            'fernsehen': { pr:['sehe fern','siehst fern','sieht fern','sehen fern','seht fern','sehen fern'], pt:['sah fern','sahst fern','sah fern','sahen fern','saht fern','sahen fern'], aux:'haben', p2:'ferngesehen' },
            'ansehen': { pr:['sehe an','siehst an','sieht an','sehen an','seht an','sehen an'], pt:['sah an','sahst an','sah an','sahen an','saht an','sahen an'], aux:'haben', p2:'angesehen' },
            'nachsehen': { pr:['sehe nach','siehst nach','sieht nach','sehen nach','seht nach','sehen nach'], pt:['sah nach','sahst nach','sah nach','sahen nach','saht nach','sahen nach'], aux:'haben', p2:'nachgesehen' },
            'vorsehen': { pr:['sehe vor','siehst vor','sieht vor','sehen vor','seht vor','sehen vor'], pt:['sah vor','sahst vor','sah vor','sahen vor','saht vor','sahen vor'], aux:'haben', p2:'vorgesehen' },
            'zusehen': { pr:['sehe zu','siehst zu','sieht zu','sehen zu','seht zu','sehen zu'], pt:['sah zu','sahst zu','sah zu','sahen zu','saht zu','sahen zu'], aux:'haben', p2:'zugesehen' },
            'einsehen': { pr:['sehe ein','siehst ein','sieht ein','sehen ein','seht ein','sehen ein'], pt:['sah ein','sahst ein','sah ein','sahen ein','saht ein','sahen ein'], aux:'haben', p2:'eingesehen' },
            'zumachen': { pr:['mache zu','machst zu','macht zu','machen zu','macht zu','machen zu'], pt:['machte zu','machtest zu','machte zu','machten zu','machtet zu','machten zu'], aux:'haben', p2:'zugemacht' },
            'aufmachen': { pr:['mache auf','machst auf','macht auf','machen auf','macht auf','machen auf'], pt:['machte auf','machtest auf','machte auf','machten auf','machtet auf','machten auf'], aux:'haben', p2:'aufgemacht' },
            'anmachen': { pr:['mache an','machst an','macht an','machen an','macht an','machen an'], pt:['machte an','machtest an','machte an','machten an','machtet an','machten an'], aux:'haben', p2:'angemacht' },
            'ausmachen': { pr:['mache aus','machst aus','macht aus','machen aus','macht aus','machen aus'], pt:['machte aus','machtest aus','machte aus','machten aus','machtet aus','machten aus'], aux:'haben', p2:'ausgemacht' },
            'mitmachen': { pr:['mache mit','machst mit','macht mit','machen mit','macht mit','machen mit'], pt:['machte mit','machtest mit','machte mit','machten mit','machtet mit','machten mit'], aux:'haben', p2:'mitgemacht' },
            'weitermachen': { pr:['mache weiter','machst weiter','macht weiter','machen weiter','macht weiter','machen weiter'], pt:['machte weiter','machtest weiter','machte weiter','machten weiter','machtet weiter','machten weiter'], aux:'haben', p2:'weitergemacht' },
            'nachmachen': { pr:['mache nach','machst nach','macht nach','machen nach','macht nach','machen nach'], pt:['machte nach','machtest nach','machte nach','machten nach','machtet nach','machten nach'], aux:'haben', p2:'nachgemacht' },
            'vormachen': { pr:['mache vor','machst vor','macht vor','machen vor','macht vor','machen vor'], pt:['machte vor','machtest vor','machte vor','machten vor','machtet vor','machten vor'], aux:'haben', p2:'vorgemacht' },
            'durchmachen': { pr:['mache durch','machst durch','macht durch','machen durch','macht durch','machen durch'], pt:['machte durch','machtest durch','machte durch','machten durch','machtet durch','machten durch'], aux:'haben', p2:'durchgemacht' },
            'aufrufen': { pr:['rufe auf','rufst auf','ruft auf','rufen auf','ruft auf','rufen auf'], pt:['rief auf','riefst auf','rief auf','riefen auf','rieft auf','riefen auf'], aux:'haben', p2:'aufgerufen' },
            'ausrufen': { pr:['rufe aus','rufst aus','ruft aus','rufen aus','ruft aus','rufen aus'], pt:['rief aus','riefst aus','rief aus','riefen aus','rieft aus','riefen aus'], aux:'haben', p2:'ausgerufen' },
            'zurückrufen': { pr:['rufe zurück','rufst zurück','ruft zurück','rufen zurück','ruft zurück','rufen zurück'], pt:['rief zurück','riefst zurück','rief zurück','riefen zurück','rieft zurück','riefen zurück'], aux:'haben', p2:'zurückgerufen' },
            'auffangen': { pr:['fange auf','fängst auf','fängt auf','fangen auf','fangt auf','fangen auf'], pt:['fing auf','fingst auf','fing auf','fingen auf','fingt auf','fingen auf'], aux:'haben', p2:'aufgefangen' },
            'einfangen': { pr:['fange ein','fängst ein','fängt ein','fangen ein','fangt ein','fangen ein'], pt:['fing ein','fingst ein','fing ein','fingen ein','fingt ein','fingen ein'], aux:'haben', p2:'eingefangen' },
            'aufschlagen': { pr:['schlage auf','schlägst auf','schlägt auf','schlagen auf','schlagt auf','schlagen auf'], pt:['schlug auf','schlugst auf','schlug auf','schlugen auf','schlugt auf','schlugen auf'], aux:'haben', p2:'aufgeschlagen' },
            'nachschlagen': { pr:['schlage nach','schlägst nach','schlägt nach','schlagen nach','schlagt nach','schlagen nach'], pt:['schlug nach','schlugst nach','schlug nach','schlugen nach','schlugt nach','schlugen nach'], aux:'haben', p2:'nachgeschlagen' },
            'zuschlagen': { pr:['schlage zu','schlägst zu','schlägt zu','schlagen zu','schlagt zu','schlagen zu'], pt:['schlug zu','schlugst zu','schlug zu','schlugen zu','schlugt zu','schlugen zu'], aux:'haben', p2:'zugeschlagen' },
            'anziehen': { pr:['ziehe an','ziehst an','zieht an','ziehen an','zieht an','ziehen an'], pt:['zog an','zogst an','zog an','zogen an','zogt an','zogen an'], aux:'haben', p2:'angezogen' },
            'einziehen': { pr:['ziehe ein','ziehst ein','zieht ein','ziehen ein','zieht ein','ziehen ein'], pt:['zog ein','zogst ein','zog ein','zogen ein','zogt ein','zogen ein'], aux:'sein', p2:'eingezogen' },
            'wegziehen': { pr:['ziehe weg','ziehst weg','zieht weg','ziehen weg','zieht weg','ziehen weg'], pt:['zog weg','zogst weg','zog weg','zogen weg','zogt weg','zogen weg'], aux:'sein', p2:'weggezogen' },
            'losziehen': { pr:['ziehe los','ziehst los','zieht los','ziehen los','zieht los','ziehen los'], pt:['zog los','zogst los','zog los','zogen los','zogt los','zogen los'], aux:'sein', p2:'losgezogen' },
            'vorbeiziehen': { pr:['ziehe vorbei','ziehst vorbei','zieht vorbei','ziehen vorbei','zieht vorbei','ziehen vorbei'], pt:['zog vorbei','zogst vorbei','zog vorbei','zogen vorbei','zogt vorbei','zogen vorbei'], aux:'sein', p2:'vorbeigezogen' },
            'auffallen': { pr:['falle auf','fällst auf','fällt auf','fallen auf','fallt auf','fallen auf'], pt:['fiel auf','fielst auf','fiel auf','fielen auf','fielt auf','fielen auf'], aux:'sein', p2:'aufgefallen' },
            'einfallen': { pr:['falle ein','fällst ein','fällt ein','fallen ein','fallt ein','fallen ein'], pt:['fiel ein','fielst ein','fiel ein','fielen ein','fielt ein','fielen ein'], aux:'sein', p2:'eingefallen' },
            'ausfallen': { pr:['falle aus','fällst aus','fällt aus','fallen aus','fallt aus','fallen aus'], pt:['fiel aus','fielst aus','fiel aus','fielen aus','fielt aus','fielen aus'], aux:'sein', p2:'ausgefallen' },
            'hinfallen': { pr:['falle hin','fällst hin','fällt hin','fallen hin','fallt hin','fallen hin'], pt:['fiel hin','fielst hin','fiel hin','fielen hin','fielt hin','fielen hin'], aux:'sein', p2:'hingefallen' },
            'wegfallen': { pr:['falle weg','fällst weg','fällt weg','fallen weg','fallt weg','fallen weg'], pt:['fiel weg','fielst weg','fiel weg','fielen weg','fielt weg','fielen weg'], aux:'sein', p2:'weggefallen' },
            'zurückfallen': { pr:['falle zurück','fällst zurück','fällt zurück','fallen zurück','fallt zurück','fallen zurück'], pt:['fiel zurück','fielst zurück','fiel zurück','fielen zurück','fielt zurück','fielen zurück'], aux:'sein', p2:'zurückgefallen' },
            'mitbringen': { pr:['bringe mit','bringst mit','bringt mit','bringen mit','bringt mit','bringen mit'], pt:['brachte mit','brachtest mit','brachte mit','brachten mit','brachtet mit','brachten mit'], aux:'haben', p2:'mitgebracht' },
            'zurückbringen': { pr:['bringe zurück','bringst zurück','bringt zurück','bringen zurück','bringt zurück','bringen zurück'], pt:['brachte zurück','brachtest zurück','brachte zurück','brachten zurück','brachtet zurück','brachten zurück'], aux:'haben', p2:'zurückgebracht' },
            'umbringen': { pr:['bringe um','bringst um','bringt um','bringen um','bringt um','bringen um'], pt:['brachte um','brachtest um','brachte um','brachten um','brachtet um','brachten um'], aux:'haben', p2:'umgebracht' },
            'beibringen': { pr:['bringe bei','bringst bei','bringt bei','bringen bei','bringt bei','bringen bei'], pt:['brachte bei','brachtest bei','brachte bei','brachten bei','brachtet bei','brachten bei'], aux:'haben', p2:'beigebracht' },
            'unterbringen': { pr:['bringe unter','bringst unter','bringt unter','bringen unter','bringt unter','bringen unter'], pt:['brachte unter','brachtest unter','brachte unter','brachten unter','brachtet unter','brachten unter'], aux:'haben', p2:'untergebracht' },
            'anhalten': { pr:['halte an','hältst an','hält an','halten an','haltet an','halten an'], pt:['hielt an','hieltst an','hielt an','hielten an','hieltet an','hielten an'], aux:'haben', p2:'angehalten' },
            'aufhalten': { pr:['halte auf','hältst auf','hält auf','halten auf','haltet auf','halten auf'], pt:['hielt auf','hieltst auf','hielt auf','hielten auf','hieltet auf','hielten auf'], aux:'haben', p2:'aufgehalten' },
            'festhalten': { pr:['halte fest','hältst fest','hält fest','halten fest','haltet fest','halten fest'], pt:['hielt fest','hieltst fest','hielt fest','hielten fest','hieltet fest','hielten fest'], aux:'haben', p2:'festgehalten' },
            'durchhalten': { pr:['halte durch','hältst durch','hält durch','halten durch','haltet durch','halten durch'], pt:['hielt durch','hieltst durch','hielt durch','hielten durch','hieltet durch','hielten durch'], aux:'haben', p2:'durchgehalten' },
            'zurückhalten': { pr:['halte zurück','hältst zurück','hält zurück','halten zurück','haltet zurück','halten zurück'], pt:['hielt zurück','hieltst zurück','hielt zurück','hielten zurück','hieltet zurück','hielten zurück'], aux:'haben', p2:'zurückgehalten' },
            'einhalten': { pr:['halte ein','hältst ein','hält ein','halten ein','haltet ein','halten ein'], pt:['hielt ein','hieltst ein','hielt ein','hielten ein','hieltet ein','hielten ein'], aux:'haben', p2:'eingehalten' },
            'einkaufen': { pr:['kaufe ein','kaufst ein','kauft ein','kaufen ein','kauft ein','kaufen ein'], pt:['kaufte ein','kauftest ein','kaufte ein','kauften ein','kauftet ein','kauften ein'], aux:'haben', p2:'eingekauft' },
            'aufhören': { pr:['höre auf','hörst auf','hört auf','hören auf','hört auf','hören auf'], pt:['hörte auf','hörtest auf','hörte auf','hörten auf','hörtet auf','hörten auf'], aux:'haben', p2:'aufgehört' },
            'zuhören': { pr:['höre zu','hörst zu','hört zu','hören zu','hört zu','hören zu'], pt:['hörte zu','hörtest zu','hörte zu','hörten zu','hörtet zu','hörten zu'], aux:'haben', p2:'zugehört' },
            'anhören': { pr:['höre an','hörst an','hört an','hören an','hört an','hören an'], pt:['hörte an','hörtest an','hörte an','hörten an','hörtet an','hörten an'], aux:'haben', p2:'angehört' },
            'aussagen': { pr:['sage aus','sagst aus','sagt aus','sagen aus','sagt aus','sagen aus'], pt:['sagte aus','sagtest aus','sagte aus','sagten aus','sagtet aus','sagten aus'], aux:'haben', p2:'ausgesagt' },
            'absagen': { pr:['sage ab','sagst ab','sagt ab','sagen ab','sagt ab','sagen ab'], pt:['sagte ab','sagtest ab','sagte ab','sagten ab','sagtet ab','sagten ab'], aux:'haben', p2:'abgesagt' },
            'zusagen': { pr:['sage zu','sagst zu','sagt zu','sagen zu','sagt zu','sagen zu'], pt:['sagte zu','sagtest zu','sagte zu','sagten zu','sagtet zu','sagten zu'], aux:'haben', p2:'zugesagt' },
            'vorsagen': { pr:['sage vor','sagst vor','sagt vor','sagen vor','sagt vor','sagen vor'], pt:['sagte vor','sagtest vor','sagte vor','sagten vor','sagtet vor','sagten vor'], aux:'haben', p2:'vorgesagt' },
            'abfahren': { pr:['fahre ab','fährst ab','fährt ab','fahren ab','fahrt ab','fahren ab'], pt:['fuhr ab','fuhrst ab','fuhr ab','fuhren ab','fuhrt ab','fuhren ab'], aux:'sein', p2:'abgefahren' },
            'losfahren': { pr:['fahre los','fährst los','fährt los','fahren los','fahrt los','fahren los'], pt:['fuhr los','fuhrst los','fuhr los','fuhren los','fuhrt los','fuhren los'], aux:'sein', p2:'losgefahren' },
            'wegfahren': { pr:['fahre weg','fährst weg','fährt weg','fahren weg','fahrt weg','fahren weg'], pt:['fuhr weg','fuhrst weg','fuhr weg','fuhren weg','fuhrt weg','fuhren weg'], aux:'sein', p2:'weggefahren' },
            'mitfahren': { pr:['fahre mit','fährst mit','fährt mit','fahren mit','fahrt mit','fahren mit'], pt:['fuhr mit','fuhrst mit','fuhr mit','fuhren mit','fuhrt mit','fuhren mit'], aux:'sein', p2:'mitgefahren' },
            'vorbeifahren': { pr:['fahre vorbei','fährst vorbei','fährt vorbei','fahren vorbei','fahrt vorbei','fahren vorbei'], pt:['fuhr vorbei','fuhrst vorbei','fuhr vorbei','fuhren vorbei','fuhrt vorbei','fuhren vorbei'], aux:'sein', p2:'vorbeigefahren' },
            'zurückfahren': { pr:['fahre zurück','fährst zurück','fährt zurück','fahren zurück','fahrt zurück','fahren zurück'], pt:['fuhr zurück','fuhrst zurück','fuhr zurück','fuhren zurück','fuhrt zurück','fuhren zurück'], aux:'sein', p2:'zurückgefahren' },
            'aufschreiben': { pr:['schreibe auf','schreibst auf','schreibt auf','schreiben auf','schreibt auf','schreiben auf'], pt:['schrieb auf','schriebst auf','schrieb auf','schrieben auf','schriebt auf','schrieben auf'], aux:'haben', p2:'aufgeschrieben' },
            'abschreiben': { pr:['schreibe ab','schreibst ab','schreibt ab','schreiben ab','schreibt ab','schreiben ab'], pt:['schrieb ab','schriebst ab','schrieb ab','schrieben ab','schriebt ab','schrieben ab'], aux:'haben', p2:'abgeschrieben' },
            'vorlesen': { pr:['lese vor','liest vor','liest vor','lesen vor','lest vor','lesen vor'], pt:['las vor','last vor','las vor','lasen vor','last vor','lasen vor'], aux:'haben', p2:'vorgelesen' },
            'durchlesen': { pr:['lese durch','liest durch','liest durch','lesen durch','lest durch','lesen durch'], pt:['las durch','last durch','las durch','lasen durch','last durch','lasen durch'], aux:'haben', p2:'durchgelesen' },
            'einschlafen': { pr:['schlafe ein','schläfst ein','schläft ein','schlafen ein','schlaft ein','schlafen ein'], pt:['schlief ein','schliefst ein','schlief ein','schliefen ein','schlieft ein','schliefen ein'], aux:'sein', p2:'eingeschlafen' },
            'ausschlafen': { pr:['schlafe aus','schläfst aus','schläft aus','schlafen aus','schlaft aus','schlafen aus'], pt:['schlief aus','schliefst aus','schlief aus','schliefen aus','schlieft aus','schliefen aus'], aux:'haben', p2:'ausgeschlafen' },
            'aufwachen': { pr:['wache auf','wachst auf','wacht auf','wachen auf','wacht auf','wachen auf'], pt:['wachte auf','wachtest auf','wachte auf','wachten auf','wachtet auf','wachten auf'], aux:'sein', p2:'aufgewacht' },
            'aufwecken': { pr:['wecke auf','weckst auf','weckt auf','wecken auf','weckt auf','wecken auf'], pt:['weckte auf','wecktest auf','weckte auf','weckten auf','wecktet auf','weckten auf'], aux:'haben', p2:'aufgeweckt' },
            'hinlegen': { pr:['lege hin','legst hin','legt hin','legen hin','legt hin','legen hin'], pt:['legte hin','legtest hin','legte hin','legten hin','legtet hin','legten hin'], aux:'haben', p2:'hingelegt' },
            'weglegen': { pr:['lege weg','legst weg','legt weg','legen weg','legt weg','legen weg'], pt:['legte weg','legtest weg','legte weg','legten weg','legtet weg','legten weg'], aux:'haben', p2:'weggelegt' },
            'auflegen': { pr:['lege auf','legst auf','legt auf','legen auf','legt auf','legen auf'], pt:['legte auf','legtest auf','legte auf','legten auf','legtet auf','legten auf'], aux:'haben', p2:'aufgelegt' },
            'vorstellen': { pr:['stelle vor','stellst vor','stellt vor','stellen vor','stellt vor','stellen vor'], pt:['stellte vor','stelltest vor','stellte vor','stellten vor','stelltet vor','stellten vor'], aux:'haben', p2:'vorgestellt' },
            'feststellen': { pr:['stelle fest','stellst fest','stellt fest','stellen fest','stellt fest','stellen fest'], pt:['stellte fest','stelltest fest','stellte fest','stellten fest','stelltet fest','stellten fest'], aux:'haben', p2:'festgestellt' },
            'herstellen': { pr:['stelle her','stellst her','stellt her','stellen her','stellt her','stellen her'], pt:['stellte her','stelltest her','stellte her','stellten her','stelltet her','stellten her'], aux:'haben', p2:'hergestellt' },
            'anstellen': { pr:['stelle an','stellst an','stellt an','stellen an','stellt an','stellen an'], pt:['stellte an','stelltest an','stellte an','stellten an','stelltet an','stellten an'], aux:'haben', p2:'angestellt' },
            'ausstellen': { pr:['stelle aus','stellst aus','stellt aus','stellen aus','stellt aus','stellen aus'], pt:['stellte aus','stelltest aus','stellte aus','stellten aus','stelltet aus','stellten aus'], aux:'haben', p2:'ausgestellt' },
            'einstellen': { pr:['stelle ein','stellst ein','stellt ein','stellen ein','stellt ein','stellen ein'], pt:['stellte ein','stelltest ein','stellte ein','stellten ein','stelltet ein','stellten ein'], aux:'haben', p2:'eingestellt' },
            'aufräumen': { pr:['räume auf','räumst auf','räumt auf','räumen auf','räumt auf','räumen auf'], pt:['räumte auf','räumtest auf','räumte auf','räumten auf','räumtet auf','räumten auf'], aux:'haben', p2:'aufgeräumt' },
            'ausräumen': { pr:['räume aus','räumst aus','räumt aus','räumen aus','räumt aus','räumen aus'], pt:['räumte aus','räumtest aus','räumte aus','räumten aus','räumtet aus','räumten aus'], aux:'haben', p2:'ausgeräumt' },
            'einpacken': { pr:['packe ein','packst ein','packt ein','packen ein','packt ein','packen ein'], pt:['packte ein','packtest ein','packte ein','packten ein','packtet ein','packten ein'], aux:'haben', p2:'eingepackt' },
            'auspacken': { pr:['packe aus','packst aus','packt aus','packen aus','packt aus','packen aus'], pt:['packte aus','packtest aus','packte aus','packten aus','packtet aus','packten aus'], aux:'haben', p2:'ausgepackt' },
            'abwaschen': { pr:['wasche ab','wäschst ab','wäscht ab','waschen ab','waschet ab','waschen ab'], pt:['wusch ab','wuschst ab','wusch ab','wuschen ab','wuscht ab','wuschen ab'], aux:'haben', p2:'abgewaschen' },
            'ausdrücken': { pr:['drücke aus','drückst aus','drückt aus','drücken aus','drückt aus','drücken aus'], pt:['drückte aus','drücktest aus','drückte aus','drückten aus','drücktet aus','drückten aus'], aux:'haben', p2:'ausgedrückt' },
            'ausfüllen': { pr:['fülle aus','füllst aus','füllt aus','füllen aus','füllt aus','füllen aus'], pt:['füllte aus','fülltest aus','füllte aus','füllten aus','fülltet aus','füllten aus'], aux:'haben', p2:'ausgefüllt' },
            'aufpassen': { pr:['passe auf','passt auf','passt auf','passen auf','passt auf','passen auf'], pt:['passte auf','passtest auf','passte auf','passten auf','passtet auf','passten auf'], aux:'haben', p2:'aufgepasst' },
            'anpassen': { pr:['passe an','passt an','passt an','passen an','passt an','passen an'], pt:['passte an','passtest an','passte an','passten an','passtet an','passten an'], aux:'haben', p2:'angepasst' },
            'anschauen': { pr:['schaue an','schaust an','schaut an','schauen an','schaut an','schauen an'], pt:['schaute an','schautest an','schaute an','schauten an','schautet an','schauten an'], aux:'haben', p2:'angeschaut' },
            'zuschauen': { pr:['schaue zu','schaust zu','schaut zu','schauen zu','schaut zu','schauen zu'], pt:['schaute zu','schautest zu','schaute zu','schauten zu','schautet zu','schauten zu'], aux:'haben', p2:'zugeschaut' },
            'weglaufen': { pr:['laufe weg','läufst weg','läuft weg','laufen weg','lauft weg','laufen weg'], pt:['lief weg','liefst weg','lief weg','liefen weg','lieft weg','liefen weg'], aux:'sein', p2:'weggelaufen' },
            'loslaufen': { pr:['laufe los','läufst los','läuft los','laufen los','lauft los','laufen los'], pt:['lief los','liefst los','lief los','liefen los','lieft los','liefen los'], aux:'sein', p2:'losgelaufen' },
            'aufspringen': { pr:['springe auf','springst auf','springt auf','springen auf','springt auf','springen auf'], pt:['sprang auf','sprangst auf','sprang auf','sprangen auf','sprangt auf','sprangen auf'], aux:'sein', p2:'aufgesprungen' },
            'einspringen': { pr:['springe ein','springst ein','springt ein','springen ein','springt ein','springen ein'], pt:['sprang ein','sprangst ein','sprang ein','sprangen ein','sprangt ein','sprangen ein'], aux:'sein', p2:'eingesprungen' },
            'antreffen': { pr:['treffe an','triffst an','trifft an','treffen an','trefft an','treffen an'], pt:['traf an','trafst an','traf an','trafen an','traft an','trafen an'], aux:'haben', p2:'angetroffen' },
            'zutreffen': { pr:['treffe zu','triffst zu','trifft zu','treffen zu','trefft zu','treffen zu'], pt:['traf zu','trafst zu','traf zu','trafen zu','traft zu','trafen zu'], aux:'haben', p2:'zugetroffen' },
            'aufsteigen': { pr:['steige auf','steigst auf','steigt auf','steigen auf','steigt auf','steigen auf'], pt:['stieg auf','stiegst auf','stieg auf','stiegen auf','stiegt auf','stiegen auf'], aux:'sein', p2:'aufgestiegen' },
            'absteigen': { pr:['steige ab','steigst ab','steigt ab','steigen ab','steigt ab','steigen ab'], pt:['stieg ab','stiegst ab','stieg ab','stiegen ab','stiegt ab','stiegen ab'], aux:'sein', p2:'abgestiegen' },
            'abholen': { pr:['hole ab','holst ab','holt ab','holen ab','holt ab','holen ab'], pt:['holte ab','holtest ab','holte ab','holten ab','holtet ab','holten ab'], aux:'haben', p2:'abgeholt' },
            'nachholen': { pr:['hole nach','holst nach','holt nach','holen nach','holt nach','holen nach'], pt:['holte nach','holtest nach','holte nach','holten nach','holtet nach','holten nach'], aux:'haben', p2:'nachgeholt' },
            'anmelden': { pr:['melde an','meldest an','meldet an','melden an','meldet an','melden an'], pt:['meldete an','meldetest an','meldete an','meldeten an','meldetet an','meldeten an'], aux:'haben', p2:'angemeldet' },
            'abmelden': { pr:['melde ab','meldest ab','meldet ab','melden ab','meldet ab','melden ab'], pt:['meldete ab','meldetest ab','meldete ab','meldeten ab','meldetet ab','meldeten ab'], aux:'haben', p2:'abgemeldet' },
            'zurücktreten': { pr:['trete zurück','trittst zurück','tritt zurück','treten zurück','tretet zurück','treten zurück'], pt:['trat zurück','tratst zurück','trat zurück','traten zurück','tratet zurück','traten zurück'], aux:'sein', p2:'zurückgetreten' },
            'eintreten': { pr:['trete ein','trittst ein','tritt ein','treten ein','tretet ein','treten ein'], pt:['trat ein','tratst ein','trat ein','traten ein','tratet ein','traten ein'], aux:'sein', p2:'eingetreten' }
        };
        IRREGULAR_VERBS['können'] = IRREGULAR_VERBS.koennen;
        IRREGULAR_VERBS['müssen'] = IRREGULAR_VERBS.muessen;
        IRREGULAR_VERBS['dürfen'] = IRREGULAR_VERBS.duerfen;
        IRREGULAR_VERBS['mögen'] = IRREGULAR_VERBS.moegen;
        IRREGULAR_VERBS['heißen'] = IRREGULAR_VERBS.heissen;
        IRREGULAR_VERBS['schließen'] = IRREGULAR_VERBS.schliessen;
        IRREGULAR_VERBS['beißen'] = IRREGULAR_VERBS.beissen;
        IRREGULAR_VERBS['gebären'] = IRREGULAR_VERBS.gebaeren;
        IRREGULAR_VERBS['genießen'] = IRREGULAR_VERBS.geniessen;
        IRREGULAR_VERBS['gießen'] = IRREGULAR_VERBS.giessen;
        IRREGULAR_VERBS['hängen'] = IRREGULAR_VERBS.haengen;
        IRREGULAR_VERBS['lügen'] = IRREGULAR_VERBS.luegen;
        IRREGULAR_VERBS['schießen'] = IRREGULAR_VERBS.schiessen;
        IRREGULAR_VERBS['schmeißen'] = IRREGULAR_VERBS.schmeissen;
        IRREGULAR_VERBS['schwören'] = IRREGULAR_VERBS.schwoeren;
        IRREGULAR_VERBS['sprießen'] = IRREGULAR_VERBS.spriessen;
        IRREGULAR_VERBS['stoßen'] = IRREGULAR_VERBS.stossen;
        IRREGULAR_VERBS['trügen'] = IRREGULAR_VERBS.truegen;
        IRREGULAR_VERBS['reißen'] = IRREGULAR_VERBS.reissen;
        IRREGULAR_VERBS['zurückkommen'] = IRREGULAR_VERBS.zurueckkommen;

        const AUX = {
            haben: { pr:['habe','hast','hat','haben','habt','haben'], pt:['hatte','hattest','hatte','hatten','hattet','hatten'] },
            sein:  { pr:['bin','bist','ist','sind','seid','sind'], pt:['war','warst','war','waren','wart','waren'] }
        };

        function generatePartizip2(verb) {
            if (verb.endsWith("ieren")) {
                return verb.slice(0, -2) + "t"; 
            } 
            else {
                let stem = verb.slice(0, -2);
                if (stem.endsWith('t') || stem.endsWith('d')) {
                    return "ge" + stem + "et";
                }
                return "ge" + stem + "t";
            }
        }

        const INSEPARABLE_AMBIGUOUS_VERBS = new Set([
            'durchsuchen', 'durchqueren', 'durchleben', 'durchdenken', 'durchkreuzen',
            'überqueren', 'überraschen', 'überzeugen', 'überwinden', 'übersetzen',
            'umarmen', 'umgeben', 'umzingeln',
            'unterschreiben', 'unterstützen', 'unterbrechen', 'untersuchen', 'unterhalten',
            'widersprechen', 'widerstehen', 'widerspiegeln',
            'wiederholen'
        ]);


        const SEPARABLE_PREFIXES = [
            'zurecht', 'zusammen', 'hinterher', 'entgegen', 'entlang', 'gegenüber',
            'voraus', 'vorbei', 'vorüber', 'voran', 'herunter', 'herüber', 'hervor',
            'herein', 'herbei', 'heraus', 'herauf', 'heran', 'hinunter', 'hinüber',
            'hinein', 'hinauf', 'hinab', 'hinweg',
            'zurück', 'weiter', 'nieder', 'davon', 'dabei', 'dazu', 'empor',
            'heim', 'fehl', 'fest', 'fort', 'her', 'hin', 'los', 'mit', 'nach',
            'vor', 'weg', 'zu', 'ab', 'an', 'auf', 'aus', 'bei', 'ein'
        ].sort((a, b) => b.length - a.length);


        const NON_SEPARABLE_LOOKALIKES = new Set(['antworten']);


        function splitSeparablePrefix(word) {
            if (NON_SEPARABLE_LOOKALIKES.has(word)) return null;
            for (const prefix of SEPARABLE_PREFIXES) {
                if (word.length <= prefix.length + 2 || !word.startsWith(prefix)) continue;
                const base = word.slice(prefix.length);
                if (IRREGULAR_VERBS[base] || isLikelyVerb(base)) {
                    return { prefix, base };
                }
            }
            return null;
        }


        function buildSeparableForms(baseConj, prefix) {
            const pr = baseConj.pr.map(f => f + ' ' + prefix);
            const pt = baseConj.pt.map(f => f + ' ' + prefix);
            const p2 = prefix + baseConj.p2;
            return { pr, pt, aux: baseConj.aux, p2: p2 };
        }

        function regularConjugate(inf) {
            let stem;
            if (/(eln|ern)$/.test(inf)) stem = inf.slice(0, -1);
            else if (/en$/.test(inf))   stem = inf.slice(0, -2);
            else if (/n$/.test(inf))    stem = inf.slice(0, -1);
            else return null;
            if (!stem) return null;

            const needsE = /[dt]$/.test(stem) || /[^aeiouäöü](m|n)$/.test(stem);
            const sibilant = /[sxzß]$/.test(stem) || /sch$/.test(stem);

            const e1 = needsE ? 'e' : '';
            const prIch = stem + 'e';
            const prDu = sibilant ? stem + 't' : stem + e1 + 'st';
            const prEr = stem + e1 + 't';
            const prWir = inf;
            const prIhr = stem + e1 + 't';
            const prSie = inf;

            const ptIch = stem + e1 + 'te';
            const ptDu = stem + e1 + 'test';
            const ptEr = stem + e1 + 'te';
            const ptWir = stem + e1 + 'ten';
            const ptIhr = stem + e1 + 'tet';
            const ptSie = stem + e1 + 'ten';

            const alwaysInseparable = /^(be|ge|er|ver|zer|ent|emp|miss)/.test(stem);
            const knownInseparableAmbiguous = INSEPARABLE_AMBIGUOUS_VERBS.has(inf);
            const noGe = alwaysInseparable || knownInseparableAmbiguous || /ieren$/.test(inf);
            const p2 = (noGe ? '' : 'ge') + stem + e1 + 't';

            return {
                pr: [prIch, prDu, prEr, prWir, prIhr, prSie],
                pt: [ptIch, ptDu, ptEr, ptWir, ptIhr, ptSie],
                aux: 'haben',
                p2: p2
            };
        }

        function isLikelyVerb(word) {
            return /(en|eln|ern)$/.test(word) && word.length > 3;
        }


        function getConjugationInfo(rawWord) {
            const trimmed = (rawWord || '').trim();
            if (!trimmed) return null;
            if (/^[A-ZÄÖÜ]/.test(trimmed)) return null;
            const word = trimmed.toLowerCase();
            if (IRREGULAR_VERBS[word]) return { conj: IRREGULAR_VERBS[word], source: 'table' };

            const split = splitSeparablePrefix(word);
            if (split) {
                const baseConj = IRREGULAR_VERBS[split.base] || regularConjugate(split.base);
                if (baseConj) {
                    return { conj: buildSeparableForms(baseConj, split.prefix), source: 'guess' };
                }
            }

            if (isLikelyVerb(word)) {
                const guess = regularConjugate(word);
                return guess ? { conj: guess, source: 'guess' } : null;
            }
            return null;
        }

        function getConjugation(rawWord) {
            const info = getConjugationInfo(rawWord);
            return info ? info.conj : null;
        }


        function isTableVerb(rawWord) {
            const trimmed = (rawWord || '').trim();
            if (!trimmed) return false;
            const word = trimmed.toLowerCase();
            return !!IRREGULAR_VERBS[word];
        }

        function buildConjugationTable(conj) {
            const auxForms = AUX[conj.aux].pr;
            const auxFormsPt = AUX[conj.aux].pt;
            let html = '<tr><th></th><th>PRÄSENS</th><th>PRÄTERITUM</th><th>PERFEKT</th><th>PLUSQUAMPERFEKT</th></tr>';
            for (let i = 0; i < PERSONS.length; i++) {
                const perfekt = auxForms[i] + ' ' + conj.p2;
                const plusquamperfekt = auxFormsPt[i] + ' ' + conj.p2;
                html += '<tr><td>' + escapeHtml(PERSONS[i]) + '</td><td>' + escapeHtml(conj.pr[i]) + '</td><td>' + escapeHtml(conj.pt[i]) + '</td><td>' + escapeHtml(perfekt) + '</td><td>' + escapeHtml(plusquamperfekt) + '</td></tr>';
            }
            return html;
        }


        const WUERDE = ['würde', 'würdest', 'würde', 'würden', 'würdet', 'würden'];

        const KONJ1_SPECIAL = {
            sein: ['sei', 'seist', 'sei', 'seien', 'seiet', 'seien'],
            haben: ['habe', 'habest', 'habe', 'haben', 'habet', 'haben'],
            werden: ['werde', 'werdest', 'werde', 'werden', 'werdet', 'werden'],
            wissen: ['wisse', 'wissest', 'wisse', 'wissen', 'wisset', 'wissen'],
            koennen: ['könne', 'könnest', 'könne', 'können', 'könnet', 'können'],
            muessen: ['müsse', 'müssest', 'müsse', 'müssen', 'müsset', 'müssen'],
            wollen: ['wolle', 'wollest', 'wolle', 'wollen', 'wollet', 'wollen'],
            sollen: ['solle', 'sollest', 'solle', 'sollen', 'sollet', 'sollen'],
            duerfen: ['dürfe', 'dürfest', 'dürfe', 'dürfen', 'dürfet', 'dürfen'],
            moegen: ['möge', 'mögest', 'möge', 'mögen', 'möget', 'mögen']
        };
        KONJ1_SPECIAL['können'] = KONJ1_SPECIAL.koennen;
        KONJ1_SPECIAL['müssen'] = KONJ1_SPECIAL.muessen;
        KONJ1_SPECIAL['dürfen'] = KONJ1_SPECIAL.duerfen;
        KONJ1_SPECIAL['mögen'] = KONJ1_SPECIAL.moegen;

        const KONJ2_SPECIAL = {
            sein: ['wäre', 'wärst', 'wäre', 'wären', 'wärt', 'wären'],
            haben: ['hätte', 'hättest', 'hätte', 'hätten', 'hättet', 'hätten'],
            werden: ['würde', 'würdest', 'würde', 'würden', 'würdet', 'würden'],
            wissen: ['wüsste', 'wüsstest', 'wüsste', 'wüssten', 'wüsstet', 'wüssten'],
            koennen: ['könnte', 'könntest', 'könnte', 'könnten', 'könntet', 'könnten'],
            muessen: ['müsste', 'müsstest', 'müsste', 'müssten', 'müsstet', 'müssten'],
            wollen: ['wollte', 'wolltest', 'wollte', 'wollten', 'wolltet', 'wollten'],
            sollen: ['sollte', 'solltest', 'sollte', 'sollten', 'solltet', 'sollten'],
            duerfen: ['dürfte', 'dürftest', 'dürfte', 'dürften', 'dürftet', 'dürften'],
            moegen: ['möchte', 'möchtest', 'möchte', 'möchten', 'möchtet', 'möchten']
        };
        KONJ2_SPECIAL['können'] = KONJ2_SPECIAL.koennen;
        KONJ2_SPECIAL['müssen'] = KONJ2_SPECIAL.muessen;
        KONJ2_SPECIAL['dürfen'] = KONJ2_SPECIAL.duerfen;
        KONJ2_SPECIAL['mögen'] = KONJ2_SPECIAL.moegen;

        function splitVerbAndRest(formStr) {
            const idx = (formStr || '').indexOf(' ');
            if (idx === -1) return { verb: formStr || '', rest: '' };
            return { verb: formStr.slice(0, idx), rest: formStr.slice(idx) };
        }

        function stemFromInfinitiveLike(mainWord) {
            if (/(eln|ern)$/.test(mainWord)) return mainWord.slice(0, -1);
            if (/en$/.test(mainWord)) return mainWord.slice(0, -2);
            if (/n$/.test(mainWord)) return mainWord.slice(0, -1);
            return mainWord;
        }

        function umlautify(stem) {
            if (/au[^aou]*$/.test(stem)) return stem.replace(/au([^aou]*)$/, 'äu$1');
            if (/a[^aou]*$/.test(stem)) return stem.replace(/a([^aou]*)$/, 'ä$1');
            if (/o[^aou]*$/.test(stem)) return stem.replace(/o([^aou]*)$/, 'ö$1');
            if (/u[^aou]*$/.test(stem)) return stem.replace(/u([^aou]*)$/, 'ü$1');
            return stem;
        }

        function buildKonjunktiv1(conj, word) {
            if (KONJ1_SPECIAL[word]) return KONJ1_SPECIAL[word];
            const { verb, rest } = splitVerbAndRest(conj.pr[3]);
            const stem = stemFromInfinitiveLike(verb);
            return [stem + 'e' + rest, stem + 'est' + rest, stem + 'e' + rest, stem + 'en' + rest, stem + 'et' + rest, stem + 'en' + rest];
        }

        function buildKonjunktiv2(conj, word, source) {
            if (KONJ2_SPECIAL[word]) return KONJ2_SPECIAL[word];
            if (source !== 'table') return conj.pt.slice();
            const { verb, rest } = splitVerbAndRest(conj.pt[3]);
            let stem = stemFromInfinitiveLike(verb);
            stem = umlautify(stem);
            return [stem + 'e' + rest, stem + 'est' + rest, stem + 'e' + rest, stem + 'en' + rest, stem + 'et' + rest, stem + 'en' + rest];
        }

        function buildFutur1(conj, word) {
            const werdenPr = IRREGULAR_VERBS.werden.pr;
            return werdenPr.map(f => f + ' ' + word);
        }

        function buildFutur2(conj, word) {
            const werdenPr = IRREGULAR_VERBS.werden.pr;
            return werdenPr.map(f => f + ' ' + conj.p2 + ' ' + conj.aux);
        }

        function buildKonditional1(conj, word) {
            return WUERDE.map(f => f + ' ' + word);
        }

        function buildKonditional2(conj, word) {
            return WUERDE.map(f => f + ' ' + conj.p2 + ' ' + conj.aux);
        }

        function stripImperativeEnding(duVerb, infStem) {


            if (/[sßzx]$/.test(infStem) || /tz$/.test(infStem)) {
                return duVerb.endsWith('t') ? duVerb.slice(0, -1) : duVerb;
            }
            if (duVerb.endsWith('st')) return duVerb.slice(0, -2);
            if (duVerb.endsWith('t')) return duVerb.slice(0, -1);
            return duVerb;
        }

        function deUmlautForImperative(imperativeStem, infinitiveStem) {
            const map = { 'ä': 'a', 'ö': 'o', 'ü': 'u' };
            for (const uml of Object.keys(map)) {
                const plain = map[uml];
                if (imperativeStem.includes(uml) && infinitiveStem.includes(plain) && !infinitiveStem.includes(uml)) {
                    return imperativeStem.replace(uml, plain);
                }
            }
            return imperativeStem;
        }

        function buildImperativ(conj, word) {
            if (word === 'sein') return { du: 'sei', ihr: 'seid', wir: 'seien wir', sie: 'seien Sie' };
            const { verb: duVerb, rest: duRest } = splitVerbAndRest(conj.pr[1]);
            const infVerb = splitVerbAndRest(conj.pr[3]).verb;
            const infStem = stemFromInfinitiveLike(infVerb);
            let duStem = stripImperativeEnding(duVerb, infStem);
            duStem = deUmlautForImperative(duStem, infStem);
            const infDisplay = conj.pr[3];
            return {
                du: duStem + duRest,
                ihr: conj.pr[4],
                wir: infDisplay + ' wir',
                sie: infDisplay + ' Sie'
            };
        }

        function buildInfinitivPartizip(conj, word) {


            const { verb: infVerb, rest: sepRest } = splitVerbAndRest(conj.pr[3]);
            const prefix = sepRest.trim();
            const inf1zu = prefix ? (prefix + 'zu' + infVerb) : ('zu ' + word);
            return {
                inf1: word,
                inf1zu: inf1zu,
                inf2: conj.p2 + ' ' + conj.aux,
                inf2zu: conj.p2 + ' zu ' + conj.aux,
                part1: word === 'sein' ? 'seiend' : word + 'd',
                part2: conj.p2
            };
        }

        function buildExtendedConjugationTable(conj, word, source) {
            const k1 = buildKonjunktiv1(conj, word);
            const k2 = buildKonjunktiv2(conj, word, source);
            const f1 = buildFutur1(conj, word);
            const f2 = buildFutur2(conj, word);
            let rows = '<tr><th></th><th>FUTUR I</th><th>FUTUR II</th><th>KONJUNKTIV I</th><th>KONJUNKTIV II</th></tr>';
            for (let i = 0; i < PERSONS.length; i++) {
                rows += '<tr><td>' + escapeHtml(PERSONS[i]) + '</td><td>' + escapeHtml(f1[i]) + '</td><td>' + escapeHtml(f2[i]) + '</td><td>' + escapeHtml(k1[i]) + '</td><td>' + escapeHtml(k2[i]) + '</td></tr>';
            }
            const kond1 = buildKonditional1(conj, word);
            const kond2 = buildKonditional2(conj, word);
            let kondRows = '<tr><th></th><th>KONDITIONAL I (würde)</th><th>KONDITIONAL II</th></tr>';
            for (let i = 0; i < PERSONS.length; i++) {
                kondRows += '<tr><td>' + escapeHtml(PERSONS[i]) + '</td><td>' + escapeHtml(kond1[i]) + '</td><td>' + escapeHtml(kond2[i]) + '</td></tr>';
            }
            const imp = buildImperativ(conj, word);
            const ip = buildInfinitivPartizip(conj, word);
            const impHtml = '<div class="conj-mini-grid">'
                + '<div><b>du</b>' + escapeHtml(imp.du) + '!</div>'
                + '<div><b>wir</b>' + escapeHtml(imp.wir) + '!</div>'
                + '<div><b>ihr</b>' + escapeHtml(imp.ihr) + '!</div>'
                + '<div><b>Sie</b>' + escapeHtml(imp.sie) + '!</div>'
                + '</div>';
            const ipHtml = '<div class="conj-mini-grid">'
                + '<div><b>Infinitiv I</b>' + escapeHtml(ip.inf1) + ' · ' + escapeHtml(ip.inf1zu) + '</div>'
                + '<div><b>Infinitiv II</b>' + escapeHtml(ip.inf2) + ' · ' + escapeHtml(ip.inf2zu) + '</div>'
                + '<div><b>Partizip I</b>' + escapeHtml(ip.part1) + '</div>'
                + '<div><b>Partizip II</b>' + escapeHtml(ip.part2) + '</div>'
                + '</div>';
            return '<div class="conj-extended">'
                + '<table class="conj-table">' + rows + '</table>'
                + '<table class="conj-table">' + kondRows + '</table>'
                + '<div><div class="conj-extended-title">Imperativ</div>' + impHtml + '</div>'
                + '<div><div class="conj-extended-title">Infinitiv &amp; Partizip</div>' + ipHtml + '</div>'
                + '</div>';
        }


        function buildConjugationSpeechText(conj) {
            const auxForms = AUX[conj.aux].pr;
            const auxFormsPt = AUX[conj.aux].pt;
            const tenses = [
                { label: 'Präsens', forms: conj.pr },
                { label: 'Präteritum', forms: conj.pt },
                { label: 'Perfekt', forms: PERSONS.map((_, i) => auxForms[i] + ' ' + conj.p2) },
                { label: 'Plusquamperfekt', forms: PERSONS.map((_, i) => auxFormsPt[i] + ' ' + conj.p2) }
            ];
            return tenses.map(t => {
                const parts = PERSONS.map((p, i) => p + ' ' + t.forms[i]).join(', ');
                return t.label + ': ' + parts + '.';
            }).join(' ');
        }

        function buildConjugationBoxesSpeechText(boxes) {
            return boxes.map(c => (c.label ? c.label + '. ' : '') + buildConjugationSpeechText(c)).join(' ');
        }

        function stripLeadingPronoun(text, personIndex) {
            if (!text) return text;
            const CANDIDATES = { 0: ['ich'], 1: ['du'], 2: ['er', 'sie', 'es'], 3: ['wir'], 4: ['ihr'], 5: ['sie'] };
            const list = CANDIDATES[personIndex];
            if (!list) return text;
            const pattern = new RegExp('^(?:' + list.join('|') + ')\\s+', 'i');
            return text.replace(pattern, '').trim();
        }

        function sanitizeConjugationForms(conj) {
            if (!conj) return conj;
            return Object.assign({}, conj, {
                pr: (conj.pr || []).map((f, i) => stripLeadingPronoun(f, i)),
                pt: (conj.pt || []).map((f, i) => stripLeadingPronoun(f, i))
            });
        }



    // Global exports for seamless backwards compatibility
    global.PERSONS = PERSONS;
    global.IRREGULAR_VERBS = IRREGULAR_VERBS;
    global.AUX = AUX;
    global.generatePartizip2 = generatePartizip2;
    global.splitSeparablePrefix = splitSeparablePrefix;
    global.buildSeparableForms = buildSeparableForms;
    global.regularConjugate = regularConjugate;
    global.isLikelyVerb = isLikelyVerb;
    global.getConjugationInfo = getConjugationInfo;
    global.getConjugation = getConjugation;
    global.isTableVerb = isTableVerb;
    global.buildConjugationTable = buildConjugationTable;
    global.buildExtendedConjugationTable = buildExtendedConjugationTable;
    global.splitVerbAndRest = splitVerbAndRest;
    global.stemFromInfinitiveLike = stemFromInfinitiveLike;
    global.umlautify = umlautify;
    global.buildKonjunktiv1 = buildKonjunktiv1;
    global.buildKonjunktiv2 = buildKonjunktiv2;
    global.buildFutur1 = buildFutur1;
    global.buildFutur2 = buildFutur2;
    global.buildKonditional1 = buildKonditional1;
    global.buildKonditional2 = buildKonditional2;
    global.stripImperativeEnding = stripImperativeEnding;
    global.deUmlautForImperative = deUmlautForImperative;
    global.buildImperativ = buildImperativ;
    global.buildInfinitivPartizip = buildInfinitivPartizip;
    global.buildConjugationSpeechText = buildConjugationSpeechText;
    global.buildConjugationBoxesSpeechText = buildConjugationBoxesSpeechText;
    global.stripLeadingPronoun = stripLeadingPronoun;
    global.sanitizeConjugationForms = sanitizeConjugationForms;

    // Namespace
    global.GermanConjugation = {
        PERSONS,
        IRREGULAR_VERBS,
        AUX,
        generatePartizip2,
        splitSeparablePrefix,
        buildSeparableForms,
        regularConjugate,
        isLikelyVerb,
        getConjugationInfo,
        getConjugation,
        isTableVerb,
        buildConjugationTable,
        buildExtendedConjugationTable,
        buildConjugationSpeechText,
        buildConjugationBoxesSpeechText,
        sanitizeConjugationForms
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.GermanConjugation;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);

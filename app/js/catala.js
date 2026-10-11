// Simulador S&P 500 · versió en català de l'informe. Tradueix els textos de l'informe un cop pintat (també els dels
// gràfics, que es dibuixen després): primer els noms sencers (sectors, indústries, files de les taules), després les
// frases de les plantilles de més llargues a més curtes i, finalment, algunes paraules soltes. Les xifres no canvien.
(function (A) {
  // ---------------------------------------------------------------- noms i textos sencers
  const NOM = {
    // sectors GICS
    'Servicios de comunicación': 'Serveis de comunicació', 'Consumo discrecional': 'Consum discrecional', 'Consumo básico': 'Consum bàsic', 'Energía': 'Energia',
    'Finanzas': 'Finances', 'Salud': 'Salut', 'Industria': 'Indústria', 'Tecnología': 'Tecnologia', 'Materiales': 'Materials', 'Inmobiliario': 'Immobiliari',
    'Suministros públicos': 'Subministraments públics',
    // indústries
    'Aeroespacial y defensa': 'Aeroespacial i defensa', 'Aerolíneas': 'Aerolínies', 'Agua': 'Aigua', 'Alimentación': 'Alimentació', 'Automóviles': 'Automòbils',
    'Bancos': 'Bancs', 'Bebidas': 'Begudes', 'Bienes de consumo duradero': 'Béns de consum durador', 'Biotecnología': 'Biotecnologia',
    'Comercio minorista especializado': 'Comerç minorista especialitzat', 'Comercio minorista generalista': 'Comerç minorista generalista',
    'Componentes de automoción': "Components d'automoció", 'Conglomerados industriales': 'Conglomerats industrials', 'Construcción e ingeniería': 'Construcció i enginyeria',
    'Cuidado personal': 'Cura personal', 'Distribución de consumo básico': 'Distribució de consum bàsic', 'Distribución industrial': 'Distribució industrial',
    'Distribuidores': 'Distribuïdors', 'Eléctricas': 'Elèctriques', 'Entretenimiento': 'Entreteniment', 'Envases y embalajes': 'Envasos i embalatges',
    'Equipos de comunicaciones': 'Equips de comunicacions', 'Equipos eléctricos': 'Equips elèctrics', 'Equipos y componentes electrónicos': 'Equips i components electrònics',
    'Equipos y servicios energéticos': 'Equips i serveis energètics', 'Equipos y suministros sanitarios': 'Equips i subministraments sanitaris', 'Farmacéuticas': 'Farmacèutiques',
    'Financiación al consumo': 'Finançament al consum', 'Gas': 'Gas', 'Gestión y servicios inmobiliarios': 'Gestió i serveis immobiliaris', 'Hardware tecnológico': 'Maquinari tecnològic',
    'Herramientas para ciencias de la vida': 'Eines per a ciències de la vida', 'Hoteles, restaurantes y ocio': 'Hotels, restaurants i oci', 'Maquinaria': 'Maquinària',
    'Materiales de construcción': 'Materials de construcció', 'Medios': 'Mitjans', 'Medios y servicios interactivos': 'Mitjans i serveis interactius',
    'Mercados de capitales': 'Mercats de capitals', 'Metales y minería': 'Metalls i mineria', 'Multiservicios': 'Multiserveis',
    'Petróleo, gas y combustibles': 'Petroli, gas i combustibles', 'Productores independientes y renovables': 'Productors independents i renovables',
    'Productos de construcción': 'Productes de construcció', 'Productos de ocio': "Productes d'oci", 'Productos para el hogar': 'Productes per a la llar',
    'Proveedores y servicios sanitarios': 'Proveïdors i serveis sanitaris', 'Química': 'Química', 'REIT comerciales': 'REIT comercials', 'REIT de oficinas': "REIT d'oficines",
    'REIT especializados': 'REIT especialitzats', 'REIT hoteleros': 'REIT hotelers', 'REIT industriales': 'REIT industrials', 'REIT residenciales': 'REIT residencials',
    'REIT sanitarios': 'REIT sanitaris', 'Seguros': 'Assegurances', 'Semiconductores': 'Semiconductors', 'Servicios al consumidor': 'Serveis al consumidor',
    'Servicios comerciales': 'Serveis comercials', 'Servicios de TI': 'Serveis de TI', 'Servicios financieros': 'Serveis financers', 'Servicios profesionales': 'Serveis professionals',
    'Software': 'Programari', 'Tabaco': 'Tabac', 'Tecnología sanitaria': 'Tecnologia sanitària', 'Telecomunicaciones': 'Telecomunicacions',
    'Textil, confección y lujo': 'Tèxtil, confecció i luxe', 'Transporte aéreo de mercancías y logística': 'Transport aeri de mercaderies i logística',
    'Transporte marítimo': 'Transport marítim', 'Transporte terrestre': 'Transport terrestre',
    // subindústries
    'Acero': 'Acer', 'Alimentos envasados y cárnicos': 'Aliments envasats i carnis', 'Almacenamiento y transporte de petróleo y gas': 'Emmagatzematge i transport de petroli i gas',
    'Aluminio': 'Alumini', 'Aseguradoras de salud gestionada': 'Asseguradores de salut gestionada', 'Banca de inversión e intermediación': "Banca d'inversió i intermediació",
    'Bancos diversificados': 'Bancs diversificats', 'Bancos regionales': 'Bancs regionals', 'Bolsas y datos financieros': 'Borses i dades financeres', 'Bricolaje y hogar': 'Bricolatge i llar',
    'Cable y satélite': 'Cable i satèl·lit', 'Calzado': 'Calçat', 'Carbón y combustibles': 'Carbó i combustibles', 'Casinos y juego': 'Casinos i joc', 'Centros sanitarios': 'Centres sanitaris',
    'Cerveceras': 'Cerveseres', 'Cine y entretenimiento': 'Cinema i entreteniment', 'Cobre': 'Coure', 'Comercio de electrónica': "Comerç d'electrònica",
    'Comercio de muebles y hogar': 'Comerç de mobles i llar', 'Comercio de ropa': 'Comerç de roba', 'Componentes electrónicos': 'Components electrònics',
    'Componentes y equipos eléctricos': 'Components i equips elèctrics', 'Consultoría y servicios de TI': 'Consultoria i serveis de TI', 'Corredurías de seguros': "Corredories d'assegurances",
    'Destilerías y bodegas': 'Destil·leries i cellers', 'Distribución de alimentos': "Distribució d'aliments", 'Distribución sanitaria': 'Distribució sanitària',
    'Distribución tecnológica': 'Distribució tecnològica', 'Edición': 'Edició', 'Electricidad renovable': 'Electricitat renovable', 'Electrónica de consumo': 'Electrònica de consum',
    'Envases de metal, vidrio y plástico': 'Envasos de metall, vidre i plàstic', 'Envases de papel y plástico': 'Envasos de paper i plàstic',
    'Equipos e instrumentos electrónicos': 'Equips i instruments electrònics', 'Equipos eléctricos pesados': 'Equips elèctrics pesants', 'Equipos médicos': 'Equips mèdics',
    'Equipos y servicios petroleros': 'Equips i serveis petroliers', 'Exploración y producción de petróleo y gas': 'Exploració i producció de petroli i gas',
    'Fabricación electrónica por encargo': 'Fabricació electrònica per encàrrec', 'Fabricantes de automóviles': "Fabricants d'automòbils", 'Ferrocarril': 'Ferrocarril',
    'Fertilizantes y agroquímicos': 'Fertilitzants i agroquímics', 'Gases industriales': 'Gasos industrials', 'Gestoras y bancos custodios': 'Gestores i bancs custodis',
    'Grandes superficies de consumo básico': 'Grans superfícies de consum bàsic', 'Hardware, almacenamiento y periféricos': 'Maquinari, emmagatzematge i perifèrics',
    'Herramientas y servicios para ciencias de la vida': 'Eines i serveis per a ciències de la vida', 'Holdings diversificados': 'Holdings diversificats',
    'Hoteles, complejos y cruceros': 'Hotels, complexos i creuers', 'Investigación y consultoría': 'Investigació i consultoria', 'Maquinaria agrícola': 'Maquinària agrícola',
    'Maquinaria de construcción y vehículos pesados': 'Maquinària de construcció i vehicles pesants', 'Maquinaria y componentes industriales': 'Maquinària i components industrials',
    'Materiales y equipos para semiconductores': 'Materials i equips per a semiconductors', 'Medios de pago': 'Mitjans de pagament',
    'Metales y minería diversificados': 'Metalls i mineria diversificats', 'Oro': 'Or', 'Otro comercio especializado': 'Altre comerç especialitzat',
    'Otros REIT especializados': 'Altres REIT especialitzats', 'Perforación de petróleo y gas': 'Perforació de petroli i gas', 'Petroleras integradas': 'Petrolieres integrades',
    'Proceso de datos y externalización': 'Processament de dades i externalització', 'Productores independientes de electricidad': "Productors independents d'electricitat",
    'Productos y servicios agrícolas': 'Productes i serveis agrícoles', 'Promotoras de viviendas': "Promotores d'habitatges", 'Publicidad': 'Publicitat',
    'Química básica': 'Química bàsica', 'Química diversificada': 'Química diversificada', 'Química especializada': 'Química especialitzada',
    'REIT de centros de datos': 'REIT de centres de dades', 'REIT de torres de telecomunicaciones': 'REIT de torres de telecomunicacions', 'REIT de trasteros': 'REIT de trasters',
    'REIT de viviendas unifamiliares': "REIT d'habitatges unifamiliars", 'REIT forestales': 'REIT forestals', 'REIT residenciales plurifamiliares': 'REIT residencials plurifamiliars',
    'Radio y televisión': 'Ràdio i televisió', 'Reaseguro': 'Reassegurança', 'Recursos humanos y empleo': 'Recursos humans i ocupació', 'Refino y comercialización': 'Refinació i comercialització',
    'Refrescos y bebidas sin alcohol': 'Refrescos i begudes sense alcohol', 'Restaurantes': 'Restaurants', 'Ropa, accesorios y lujo': 'Roba, accessoris i luxe',
    'Seguros de daños': 'Assegurances de danys', 'Seguros de vida y salud': 'Assegurances de vida i salut', 'Seguros multirramo': 'Assegurances multirram',
    'Servicios de apoyo diversificados': 'Serveis de suport diversificats', 'Servicios e infraestructura de internet': "Serveis i infraestructura d'internet",
    'Servicios especializados al consumidor': 'Serveis especialitzats al consumidor', 'Servicios inmobiliarios': 'Serveis immobiliaris',
    'Servicios medioambientales y de instalaciones': "Serveis mediambientals i d'instal·lacions", 'Servicios sanitarios': 'Serveis sanitaris',
    'Software de aplicaciones': "Programari d'aplicacions", 'Software de sistemas': 'Programari de sistemes', 'Suministros sanitarios': 'Subministraments sanitaris',
    'Supermercados': 'Supermercats', 'Telecomunicaciones integradas': 'Telecomunicacions integrades', 'Telecomunicaciones móviles': 'Telecomunicacions mòbils',
    'Transporte terrestre de mercancías': 'Transport terrestre de mercaderies', 'Transporte terrestre de pasajeros': 'Transport terrestre de passatgers',
    'Venta de automóviles y recambios': "Venda d'automòbils i recanvis", 'Videojuegos': 'Videojocs',
    // avisos de fiabilitat
    'Beneficio operativo negativo en los últimos doce meses': 'Benefici operatiu negatiu en els últims dotze mesos',
    'Sin consenso de analistas suficiente: años 1–2 con la tendencia histórica': "Sense prou consens d'analistes: anys 1–2 amb la tendència històrica",
    'Menos de 3 analistas en el consenso': 'Menys de 3 analistes en el consens',
    'BPA ajustado no positivo: margen de los años 1–2 sin el consenso de BPA': 'BPA ajustat no positiu: marge dels anys 1–2 sense el consens de BPA',
    'El valor terminal supera el 85 % del valor (caso base)': 'El valor terminal supera el 85 % del valor (cas base)',
    'Valor central muy alejado de la cotización (menos de un 20 % o más del triple)': "Valor central molt allunyat de la cotització (menys d'un 20 % o més del triple)",
    'El modelo da un valor del patrimonio negativo en algún escenario': 'El model dona un valor del patrimoni negatiu en algun escenari',
    'Estados financieros en otra divisa': 'Estats financers en una altra divisa',
    'Sin comparables con múltiplos válidos: valor central solo con el modelo intrínseco': 'Sense comparables amb múltiples vàlids: valor central només amb el model intrínsec',
    'Último balance de hace más de 7 meses': 'Últim balanç de fa més de 7 mesos',
    'Sin datos nuevos de Yahoo esta semana: se mantienen los de la semana anterior': 'Sense dades noves de Yahoo aquesta setmana: es mantenen les de la setmana anterior',
    'ROE muy alto sobre un valor contable pequeño: el modelo de beneficio residual es poco fiable para esta empresa': 'ROE molt alt sobre un valor comptable petit: el model de benefici residual és poc fiable per a aquesta empresa',
    'Beneficio por acción previsto negativo': 'Benefici per acció previst negatiu',
    'FFO (beneficio + amortización − partidas no recurrentes) negativo': 'FFO (benefici + amortització − partides no recurrents) negatiu',
    'El dividendo supera al FFO de los últimos doce meses': 'El dividend supera el FFO dels últims dotze mesos',
    'Sin dividendo publicado: se usa el 70 % del FFO como referencia': 'Sense dividend publicat: es fa servir el 70 % del FFO com a referència',
    'El consenso no es comparable con las últimas cifras publicadas (fusión, adquisición o venta de un negocio, cambio brusco de ciclo o distinta definición de ingresos): años 1–2 con la tendencia histórica': "El consens no és comparable amb les últimes xifres publicades (fusió, adquisició o venda d'un negoci, canvi brusc de cicle o una definició diferent dels ingressos): anys 1–2 amb la tendència històrica",
    // com es projecten els anys 1–2
    'BPA del consenso convertido en EBITA con la diferencia entre BPA publicado y EBITA de los últimos doce meses': "BPA del consens convertit en EBITA amb la diferència entre el BPA publicat i l'EBITA dels últims dotze mesos",
    'BPA "ajustado" del consenso (muy por encima del contable): EBITA ajustado menos la remuneración en acciones': 'BPA "ajustat" del consens (molt per sobre del comptable): EBITA ajustat menys la remuneració en accions',
    'BPA del consenso más los intereses netos (los últimos doce meses incluyen partidas extraordinarias)': 'BPA del consens més els interessos nets (els últims dotze mesos inclouen partides extraordinàries)',
    'sin consenso utilizable: crecimiento y margen de los últimos doce meses': 'sense consens utilitzable: creixement i marge dels últims dotze mesos',
    'crecimiento y margen revisados a mano en el Simulador 7M (consenso y guías de la empresa)': "creixement i marge revisats a mà al Simulador 7M (consens i guies de l'empresa)",
    // títols, encapçalaments i etiquetes
    '1. Resumen': '1. Resum', '2. Valor por método': '2. Valor per mètode', '3. Proyección y flujos de caja': '3. Projecció i fluxos de caixa',
    '3. Rentabilidad y beneficio residual': '3. Rendibilitat i benefici residual', '3. FFO, AFFO y dividendo': '3. FFO, AFFO i dividend',
    '4. Coste del capital y sensibilidad': '4. Cost del capital i sensibilitat', '4. Coste de los recursos propios y sensibilidad': '4. Cost dels recursos propis i sensibilitat',
    '5. Del valor de la empresa al valor por acción': "5. Del valor de l'empresa al valor per acció", '5. Del valor contable al valor por acción': '5. Del valor comptable al valor per acció',
    '5. Del flujo al valor por acción': '5. Del flux al valor per acció', '6. Comparables, Graham y analistas': '6. Comparables, Graham i analistes', '7. Datos y supuestos': '7. Dades i supòsits',
    'Informe de valoración': 'Informe de valoració', 'Conclusión del modelo': 'Conclusió del model', 'Margen de seguridad': 'Marge de seguretat', 'Sin margen de seguridad': 'Sense marge de seguretat',
    'Sin valor significativo con este modelo': 'Sense valor significatiu amb aquest model', 'Infravalorada con margen de seguridad (≥ 25 %)': 'Infravalorada amb marge de seguretat (≥ 25 %)',
    'Ligeramente infravalorada': 'Lleugerament infravalorada', 'En línea con su valor': 'En línia amb el seu valor', 'Ligeramente sobrevalorada': 'Lleugerament sobrevalorada',
    'Proyección del caso base': 'Projecció del cas base', 'Comparables y múltiplos adelantados': 'Comparables i múltiples avançats', 'Comparables y múltiplos': 'Comparables i múltiples',
    'Consenso de los analistas': 'Consens dels analistes', 'Datos y supuestos del modelo': 'Dades i supòsits del model', 'Escenario': 'Escenari', 'Pesimista': 'Pessimista',
    'Ventas': 'Vendes', 'Crecimiento': 'Creixement', 'Margen EBITA': 'Marge EBITA', 'Inversión neta': 'Inversió neta', 'Flujo de caja libre': 'Flux de caixa lliure',
    'Valor contable inicial': 'Valor comptable inicial', 'Reparto (dividendos y recompras)': 'Repartiment (dividends i recompres)', 'Beneficio residual': 'Benefici residual',
    'FFO por acción': 'FFO per acció', 'AFFO por acción': 'AFFO per acció', 'Dividendo (mismo reparto)': 'Dividend (mateix repartiment)', 'Valor actual del AFFO': "Valor actual de l'AFFO",
    'Subindustria': 'Subindústria', 'Capitalización': 'Capitalització', 'Cotización': 'Cotització', 'Rent. dividendo': 'Rend. dividend', 'Precio / valor contable': 'Preu / valor comptable',
    'PER adelantado': 'PER avançat', 'EV/EBITDA adelantado': 'EV/EBITDA avançat', 'sin valorar': 'sense valorar', 'no aplica': "no s'aplica", 'caja neta': 'caixa neta',
    '(cumple)': '(compleix)', '(no cumple)': '(no compleix)', '(no aplica)': "(no s'aplica)",
    'Precio objetivo medio': 'Preu objectiu mitjà', 'Rango de objetivos': "Rang d'objectius", 'Recomendación media': 'Recomanació mitjana', 'Analistas': 'Analistes',
    'Valor central del modelo': 'Valor central del model', 'Ventas TTM': 'Vendes TTM', 'EBITA TTM (margen)': 'EBITA TTM (marge)', 'EBIT contable': 'EBIT comptable',
    'Amortización de intangibles adquiridos': "Amortització d'intangibles adquirits", 'Amortización (sin intangibles adquiridos)': 'Amortització (sense intangibles adquirits)',
    'NOF / ventas': 'NOF / vendes', 'Capital invertido': 'Capital invertit', 'Tipo impositivo': 'Tipus impositiu', 'Remuneración en acciones': 'Remuneració en accions',
    'Deuda financiera bruta': 'Deute financer brut', 'Deuda neta': 'Deute net', 'Inversiones no operativas': 'Inversions no operatives', 'Minoritarios y preferentes': 'Minoritaris i preferents',
    'Acciones (diluidas)': 'Accions (diluïdes)', 'Rating sintético': 'Rating sintètic', 'Diferencial de la deuda': 'Diferencial del deute',
    'Margen de referencia (mediana de comparables)': 'Marge de referència (mediana de comparables)', 'Años 1–2': 'Anys 1–2',
    'Crec. año 1': 'Creix. any 1', 'Crec. año 2': 'Creix. any 2', 'Margen año 1': 'Marge any 1', 'Margen año 2': 'Marge any 2', 'Margen año 10': 'Marge any 10',
    'DCF por acción': 'DCF per acció', 'Valor contable por acción': 'Valor comptable per acció', 'Valor contable tangible por acción': 'Valor comptable tangible per acció',
    'Patrimonio de los accionistas comunes': 'Patrimoni dels accionistes comuns', 'Beneficio de los últimos doce meses': 'Benefici dels últims dotze mesos',
    'ROE de los últimos doce meses': 'ROE dels últims dotze mesos', 'BPA de los últimos doce meses': 'BPA dels últims dotze mesos', 'Dividendos + recompras (TTM)': 'Dividends + recompres (TTM)',
    'Convergencia del ROE': 'Convergència del ROE', 'BPA año 1': 'BPA any 1', 'BPA año 2': 'BPA any 2', 'ROE año 1': 'ROE any 1', 'ROE año 2': 'ROE any 2',
    'ROE largo plazo': 'ROE llarg termini', 'Valor por acción': 'Valor per acció', 'FFO de los últimos doce meses': 'FFO dels últims dotze mesos',
    'Partidas no recurrentes excluidas (plusvalías, deterioros)': 'Partides no recurrents excloses (plusvàlues, deterioraments)', 'AFFO por acción (base del modelo)': 'AFFO per acció (base del model)',
    'Dividendo anual por acción': 'Dividend anual per acció', 'Cobertura del dividendo (FFO ÷ dividendo)': 'Cobertura del dividend (FFO ÷ dividend)',
    'EBITDA de los últimos doce meses': 'EBITDA dels últims dotze mesos', 'Crecimiento año 1': 'Creixement any 1', 'Crecimiento año 2': 'Creixement any 2',
    'DCF por escenarios': 'DCF per escenaris', 'Descuento del AFFO': "Descompte de l'AFFO", 'Valor contable': 'Valor comptable', 'Patrimonio': 'Patrimoni',
    'Flujos años 1–10': 'Fluxos anys 1–10', 'Inversiones no': 'Inversions no', 'operativas': 'operatives', 'Minoritarios y': 'Minoritaris i', 'preferentes': 'preferents',
    'Beneficio residual años': 'Benefici residual anys', 'Dividendo (caso base)': 'Dividend (cas base)', 'Dividendo': 'Dividend', 'Valor actual': 'Valor actual',
    'miles de millones de $': 'milers de milions de $', 'millones de $': 'milions de $', '$ por acción': '$ per acció', 'Valor terminal': 'Valor terminal',
    'Pesimista · ponderado · optimista': 'Pessimista · ponderat · optimista', 'Mínimo · mediana · máximo de los comparables': 'Mínim · mediana · màxim dels comparables',
    'compra fuerte': 'compra forta', 'mantener': 'mantenir', 'peor que el mercado': 'pitjor que el mercat', 'venta': 'venda',
    // criteris de Graham
    'PER de los últimos doce meses ≤ 15': 'PER dels últims dotze mesos ≤ 15', 'Precio / valor contable ≤ 1,5 (o PER × P/VC ≤ 22,5)': 'Preu / valor comptable ≤ 1,5 (o PER × P/VC ≤ 22,5)',
    'Liquidez: activo corriente ≥ 2 × pasivo corriente': 'Liquiditat: actiu corrent ≥ 2 × passiu corrent', 'Solidez: deuda neta ≤ 3 × EBITDA': 'Solidesa: deute net ≤ 3 × EBITDA',
    'Solidez: deuda ≤ 2 × patrimonio (criterio de Graham para eléctricas)': 'Solidesa: deute ≤ 2 × patrimoni (criteri de Graham per a elèctriques)',
    'Solidez: deuda neta ≤ 6 × EBITDA (REIT)': 'Solidesa: deute net ≤ 6 × EBITDA (REIT)', 'Beneficios positivos todos los años disponibles': 'Beneficis positius tots els anys disponibles',
    'Dividendos todos los años disponibles': 'Dividends tots els anys disponibles', 'Crecimiento del BPA ≥ 10 % en el periodo disponible': 'Creixement del BPA ≥ 10 % en el període disponible',
    'Crecimiento del BPA ≥ 33 % en el periodo (medias de 3 años al principio y al final)': 'Creixement del BPA ≥ 33 % en el període (mitjanes de 3 anys al principi i al final)',
    'Cotización ≤ número de Graham (√(22,5 × BPA × valor contable))': 'Cotització ≤ nombre de Graham (√(22,5 × BPA × valor comptable))',
  };

  // ---------------------------------------------------------------- fragments de les plantilles (s'apliquen de més llarg a més curt)
  const FR = [
    // capçalera i resum
    ['Informe de valoración', 'Informe de valoració'], ['datos del ', 'dades del '], ['modelo: ', 'model: '],
    ['DCF de flujos de caja libres', 'DCF de fluxos de caixa lliures'], ['Beneficio residual (ROE frente al coste de los recursos propios)', 'Benefici residual (ROE davant del cost dels recursos propis)'],
    ['Descuento del AFFO (flujo disponible para el accionista del REIT)', "Descompte de l'AFFO (flux disponible per a l'accionista del REIT)"],
    ['Rango ', 'Rang '], ['Capitalización ', 'Capitalització '], ['Margen de seguridad ', 'Marge de seguretat '], ['Criterios de Graham: ', 'Criteris de Graham: '],
    ['Cotización ', 'Cotització '], ['hasta ', 'fins a '],
    ['Con los supuestos por defecto, el valor central es de ', 'Amb els supòsits per defecte, el valor central és de '],
    ['Con estos supuestos, el valor central es de ', 'Amb aquests supòsits, el valor central és de '],
    ['Con estos supuestos el WACC queda a menos de 0,5 puntos de g y el valor terminal no tiene sentido económico.', 'Amb aquests supòsits el WACC queda a menys de 0,5 punts de g i el valor terminal no té sentit econòmic.'],
    [' por acción frente a una cotización de ', " per acció davant d'una cotització de "], ['): según el modelo, ', '): segons el model, '],
    ['cotiza con un margen de seguridad amplio', 'cotitza amb un marge de seguretat ampli'], ['cotiza algo por debajo de su valor', 'cotitza una mica per sota del seu valor'],
    ['cotiza en línea con su valor', 'cotitza en línia amb el seu valor'], ['cotiza por encima de su valor', 'cotitza per sobre del seu valor'],
    ['el modelo no le da valor positivo', 'el model no li dona un valor positiu'],
    ['El DCF ponderado por escenarios da ', 'El DCF ponderat per escenaris dona '],
    ['El modelo de beneficio residual, ponderado por escenarios, da ', 'El model de benefici residual, ponderat per escenaris, dona '],
    ['El descuento del AFFO, ponderado por escenarios, da ', "El descompte de l'AFFO, ponderat per escenaris, dona "],
    [' por acción (pesimista ', ' per acció (pessimista '], [' y optimista ', ' i optimista '], [', con probabilidades del ', ', amb probabilitats del '],
    [') y los múltiplos de sus comparables, ', ') i els múltiples dels seus comparables, '], ['; el valor central pondera un ', '; el valor central pondera un '],
    [' el DCF y un ', ' el DCF i un '], [' el modelo intrínseco y un ', ' el model intrínsec i un '], [' los múltiplos.', ' els múltiples.'],
    ['; no hay comparables con múltiplos válidos, así que el valor central es el ', '; no hi ha comparables amb múltiples vàlids, així que el valor central és el '],
    ['modelo intrínseco', 'model intrínsec'],
    ['La cotización actual descuenta un crecimiento de las ventas del ', 'La cotització actual descompta un creixement de les vendes del '],
    [' anual en los próximos cinco años, frente al ', ' anual en els propers cinc anys, davant del '],
    [' del caso base (consenso de analistas en los años 1–2). ', " del cas base (consens d'analistes en els anys 1–2). "],
    ['El mercado espera más crecimiento que el modelo.', 'El mercat espera més creixement que el model.'], ['El mercado espera menos crecimiento que el modelo.', 'El mercat espera menys creixement que el model.'],
    ['La cotización actual descuenta un ROE a largo plazo del ', 'La cotització actual descompta un ROE a llarg termini del '],
    [' del caso base y a un coste de los recursos propios del ', ' del cas base i un cost dels recursos propis del '],
    ['El mercado espera que mantenga más rentabilidad que el modelo.', 'El mercat espera que mantingui més rendibilitat que el model.'],
    ['El mercado espera menos rentabilidad que el modelo.', 'El mercat espera menys rendibilitat que el model.'],
    ['La cotización actual descuenta un crecimiento del AFFO del ', "La cotització actual descompta un creixement de l'AFFO del "],
    [' de media en los años 1–2 del caso base. ', ' de mitjana en els anys 1–2 del cas base. '], [', frente al ', ', davant del '],
    ['No se puede calcular lo que descuenta la cotización con estos supuestos.', 'No es pot calcular el que descompta la cotització amb aquests supòsits.'],
    ['Este informe usa supuestos modificados en el simulador. Con los supuestos por defecto, el valor central sería ', 'Aquest informe fa servir supòsits modificats al simulador. Amb els supòsits per defecte, el valor central seria '],
    ['Avisos sobre la fiabilidad: ', 'Avisos sobre la fiabilitat: '],
    // secció 3
    ['Ventas de los últimos doce meses: ', 'Vendes dels últims dotze mesos: '], [', con un margen EBITA del ', ', amb un marge EBITA del '],
    ['. En el caso base, las ventas crecen un ', '. En el cas base, les vendes creixen un '], [' el año 1 y un ', " l'any 1 i un "], [' el año 2 y convergen al ', " l'any 2 i convergeixen al "],
    [' en el año 10; el margen pasa del ', " l'any 10; el marge passa del "], [' del año 2 al ', " de l'any 2 al "], [' del año 10.', " de l'any 10."],
    ['Valor contable de ', 'Valor comptable de '], [' por acción y ROE de los últimos doce meses del ', ' per acció i ROE dels últims dotze mesos del '],
    ['. Con el BPA del consenso, el ROE es del ', '. Amb el BPA del consens, el ROE és del '], [' el año 1 y del ', " l'any 1 i del "], [' el año 2; después converge al ', " l'any 2; després convergeix al "],
    [' a largo plazo (caso base). El valor crece mientras el ROE supere al coste de los recursos propios (', ' a llarg termini (cas base). El valor creix mentre el ROE superi el cost dels recursos propis ('],
    ['FFO de los últimos doce meses de ', 'FFO dels últims dotze mesos de '], [' por acción y AFFO estimado de ', ' per acció i AFFO estimat de '],
    [' (85 % del FFO). Dividendo de ', ' (85 % del FFO). Dividend de '], ['), cubierto ', '), cobert '], [' por el FFO. En el caso base el AFFO crece un ', " pel FFO. En el cas base l'AFFO creix un "],
    [' (ingresos del consenso) y converge a g.', ' (ingressos del consens) i convergeix a g.'],
    // secció 4
    [': coste de los recursos propios del ', ': cost dels recursos propis del '], [' (tipo sin riesgo ', ' (tipus sense risc '], [': tipo sin riesgo ', ': tipus sense risc '],
    [' × prima de riesgo ', ' × prima de risc '], [') y coste de la deuda del ', ') i cost del deute del '], [' (rating sintético ', ' (rating sintètic '], [' de deuda. ', ' de deute. '],
    ['Valor terminal por inductores de valor con g = ', 'Valor terminal per inductors de valor amb g = '], ['Valor terminal por Gordon con g = ', 'Valor terminal per Gordon amb g = '],
    ['. Valor terminal de Gordon con g = ', '. Valor terminal de Gordon amb g = '], [' del valor en el caso base.', ' del valor en el cas base.'],
    ['. En este modelo se descuenta directamente el beneficio del accionista, sin WACC: la deuda de un banco o una aseguradora es parte de su negocio. El valor terminal (beneficio residual del año 11 creciendo a g = ',
      ". En aquest model es descompta directament el benefici de l'accionista, sense WACC: el deute d'un banc o d'una asseguradora forma part del seu negoci. El valor terminal (benefici residual de l'any 11 creixent a g = "],
    // secció 5
    ['Precio / valor contable que justifica el caso base: ', 'Preu / valor comptable que justifica el cas base: '], ['; la cotización está a ', '; la cotització és a '],
    ['P/FFO que justifica el caso base: ', 'P/FFO que justifica el cas base: '],
    // peu
    ['Modelo automático con reglas comunes para todas las empresas del S&P 500 (', 'Model automàtic amb regles comunes per a totes les empreses del S&P 500 ('],
    ['; consenso de analistas en los años 1–2, convergencia a largo plazo, CAPM y múltiplos de comparables). ', "; consens d'analistes en els anys 1–2, convergència a llarg termini, CAPM i múltiples de comparables). "],
    ['Valoración revisada empresa a empresa en el Simulador 7M (', 'Valoració revisada empresa per empresa al Simulador 7M ('],
    ['; supuestos de crecimiento, márgenes, inversión y comparables revisados), con el mismo motor que el resto del S&P 500. ', '; supòsits de creixement, marges, inversió i comparables revisats), amb el mateix motor que la resta del S&P 500. '],
    ['Herramienta formativa: no es una recomendación de inversión.', "Eina formativa: no és una recomanació d'inversió."], ['Datos de Yahoo Finance.', 'Dades de Yahoo Finance.'],
    ['beneficio residual', 'benefici residual'], ['descuento del AFFO', "descompte de l'AFFO"],
    // targetes
    ['Años 1–2: consenso de analistas; años 3–10: convergencia lineal al crecimiento y al margen de largo plazo. EBITA = beneficio operativo antes de la amortización de intangibles adquiridos.',
      "Anys 1–2: consens d'analistes; anys 3–10: convergència lineal al creixement i al marge de llarg termini. EBITA = benefici operatiu abans de l'amortització d'intangibles adquirits."],
    ['Caso base. Años 1–2: BPA del consenso; después el ROE converge al ', 'Cas base. Anys 1–2: BPA del consens; després el ROE convergeix al '],
    [' y el reparto al que sostiene un crecimiento del ', ' i el repartiment al que sosté un creixement del '],
    ['. Valor terminal: beneficio residual del año 11 creciendo a g.', ". Valor terminal: benefici residual de l'any 11 creixent a g."],
    ['Caso base. Años 1–2: crecimiento de los ingresos del consenso; después converge a g (', 'Cas base. Anys 1–2: creixement dels ingressos del consens; després convergeix a g ('],
    ['). Valor terminal de Gordon sobre el AFFO del año 10.', "). Valor terminal de Gordon sobre l'AFFO de l'any 10."],
    ['Comparables elegidos a mano en el Simulador 7M (aquí solo aparecen los que forman parte del S&P 500).', 'Comparables triats a mà al Simulador 7M (aquí només hi apareixen els que formen part del S&P 500).'],
    ['Empresas del S&P 500 ', 'Empreses del S&P 500 '], ['de su misma subindustria', 'de la mateixa subindústria'],
    ['de su industria (la subindustria tiene pocas empresas comparables)', 'de la seva indústria (la subindústria té poques empreses comparables)'],
    ['de su sector (la industria tiene pocas empresas comparables)', 'del seu sector (la indústria té poques empreses comparables)'], ['de su sector', 'del seu sector'],
    [', las más parecidas en tamaño. Se descartan PER adelantados por encima de 60 y EV/EBITDA por encima de 40.', ', les més semblants en mida. Es descarten PER avançats per sobre de 60 i EV/EBITDA per sobre de 40.'],
    [' valoradas con el mismo modelo, las más parecidas en tamaño.', ' valorades amb el mateix model, les més semblants en mida.'],
    ['sin múltiplos válidos', 'sense múltiples vàlids'], [' (esta empresa)', ' (aquesta empresa)'],
    ['Criterios del inversor defensivo de Benjamin Graham (The Intelligent Investor). Beneficios, dividendos y crecimiento del BPA con los 10 últimos ejercicios presentados a la SEC (si no hay, con los 4 años de Yahoo). La liquidez no se aplica a financieras, eléctricas ni REIT, y la deuda de bancos y aseguradoras forma parte de su negocio.',
      "Criteris de l'inversor defensiu de Benjamin Graham (The Intelligent Investor). Beneficis, dividends i creixement del BPA amb els 10 últims exercicis presentats a la SEC (si no n'hi ha, amb els 4 anys de Yahoo). La liquiditat no s'aplica a financeres, elèctriques ni REIT, i el deute de bancs i asseguradores forma part del seu negoci."],
    ['Beneficios positivos en los últimos ', 'Beneficis positius els últims '], ['Dividendos ininterrumpidos en los últimos ', 'Dividends ininterromputs els últims '],
    [' · rentabilidad ', ' · rendibilitat '], [' el patrimonio', ' el patrimoni'], [' · producto ', ' · producte '],
    ['BPA de los últimos doce meses ', 'BPA dels últims dotze mesos '], [' · valor contable por acción ', ' · valor comptable per acció '], [' · número de Graham ', ' · nombre de Graham '],
    [' (la cotización está un ', ' (la cotització és un '], [' por encima)', ' per sobre)'], [' por debajo)', ' per sota)'],
    ['Precio objetivo a doce meses según Yahoo Finance. Sirve de contraste: no forma parte del modelo, que solo usa sus previsiones de ventas y BPA.',
      'Preu objectiu a dotze mesos segons Yahoo Finance. Serveix de contrast: no forma part del model, que només fa servir les seves previsions de vendes i BPA.'],
    ['compra fuerte (', 'compra forta ('], ['mantener (', 'mantenir ('], ['peor que el mercado (', 'pitjor que el mercat ('], ['venta (', 'venda ('],
    ['Cifras de los últimos doce meses hasta el ', 'Xifres dels últims dotze mesos fins al '], [' y balance del ', ' i balanç del '],
    [' (Yahoo Finance, millones de dólares).', ' (Yahoo Finance, milions de dòlars).'],
    [' (Yahoo Finance). FFO = beneficio + amortización − partidas no recurrentes (plusvalías por venta de inmuebles, deterioros); AFFO ≈ 85 % del FFO (el resto, inversión de mantenimiento).',
      " (Yahoo Finance). FFO = benefici + amortització − partides no recurrents (plusvàlues per venda d'immobles, deterioraments); AFFO ≈ 85 % del FFO (la resta, inversió de manteniment)."],
    ['Valor contable del ', 'Valor comptable del '], [' y beneficio de los últimos doce meses hasta el ', ' i benefici dels últims dotze mesos fins al '],
    [' de las ventas)', ' de les vendes)'], [' (cobertura de intereses ', " (cobertura d'interessos "], [' (por deuda / EBITDA)', ' (per deute / EBITDA)'],
    [' = media de Yahoo (', ' = mitjana de Yahoo ('], [') y de su industria reapalancada (', ') i de la seva indústria reapalancada ('], [') y de su industria (', ') i de la seva indústria ('],
    ['), mínimo 0,6', '), mínim 0,6'], [' (revisada en el Simulador 7M; la automática sería ', " (revisada al Simulador 7M; l'automàtica seria "], [' (Simulador 7M)', ' (Simulador 7M)'],
    ['Crecimiento del año 10: ', "Creixement de l'any 10: "], [' en los tres escenarios; amortización ', ' en els tres escenaris; amortització '],
    [' de las ventas; CapEx del ', ' de les vendes; CapEx del '], [' de las ventas.', ' de les vendes.'],
    [' del beneficio)', ' del benefici)'], [' del diferencial del año 2 sobre Ke se mantiene a largo plazo', " del diferencial de l'any 2 sobre Ke es manté a llarg termini"],
    [' (rentabilidad ', ' (rendibilitat '], [' (rentabilidad del ', ' (rendibilitat del '], [' por acción)', ' per acció)'],
    ['WACC demasiado cerca de g', 'WACC massa a prop de g'], ['Ke demasiado cerca de g', 'Ke massa a prop de g'], [' por acción', ' per acció'],
    [' en una escala de 1 a 5)', ' en una escala de 1 a 5)'], [' millones', ' milions'], [' billones $', ' bilions $'],
    ['PER adelantado', 'PER avançat'], ['EV/EBITDA adelantado', 'EV/EBITDA avançat'], ['Precio / valor contable', 'Preu / valor comptable'],
    ['número de Graham', 'nombre de Graham'], ['producto ', 'producte '], [' el año ', " l'any "], [' del año ', " de l'any "], [' al año ', " a l'any "],
    ['Criterios de Graham', 'Criteris de Graham'], ['Calidad: Piotroski y Greenblatt', 'Qualitat: Piotroski i Greenblatt'],
  ].sort((a, b) => b[0].length - a[0].length);

  // ---------------------------------------------------------------- paraules soltes (últim recurs)
  const PAL = [
    [/\bAño\b/g, 'Any'], [/\baño\b/g, 'any'], [/\baños\b/g, 'anys'], [/\bAños\b/g, 'Anys'], [/\bpor\b/g, 'per'], [/\bcon\b/g, 'amb'], [/\bsin\b/g, 'sense'],
    [/\by\b/g, 'i'], [/\bde los\b/g, 'dels'], [/\blos\b/g, 'els'], [/\blas\b/g, 'les'], [/\bmúltiplos\b/g, 'múltiples'], [/\bmodelo\b/g, 'model'],
    [/\bcotización\b/g, 'cotització'], [/\bacción\b/g, 'acció'], [/\bacciones\b/g, 'accions'], [/\bdeuda\b/g, 'deute'], [/\bventas\b/g, 'vendes'],
    [/\bcrecimiento\b/g, 'creixement'], [/\bmargen\b/g, 'marge'], [/\bcontable\b/g, 'comptable'], [/\bescenarios\b/g, 'escenaris'], [/\bcaso base\b/g, 'cas base'],
    [/\bdividendos\b/g, 'dividends'], [/\bdividendo\b/g, 'dividend'], [/\bbeneficio\b/g, 'benefici'], [/\brentabilidad\b/g, 'rendibilitat'], [/\bmedia\b/g, 'mitjana'],
    [/\bmínimo\b/g, 'mínim'], [/\bmáximo\b/g, 'màxim'], [/\bponderado\b/g, 'ponderat'], [/\bcomparables\b/g, 'comparables'], [/\bpara\b/g, 'per a'],
    // apostrofació davant de xifres que es llegeixen amb vocal (u, onze): «de l'1,8 %», «a l'11 %», «l'1 %»
    [/\bdel (1|11)(?=[,.\s %])/g, "de l'$1"], [/\bal (1|11)(?=[,.\s %])/g, "a l'$1"], [/\b([Ee])l (1|11)(?=[,.\s %])/g, (m, e, n) => (e === 'E' ? "L'" : "l'") + n],
  ];

  function frases(t) {
    for (const [es, ca] of FR) if (t.includes(es)) t = t.split(es).join(ca);
    for (const [re, ca] of PAL) t = t.replace(re, ca);
    return t;
  }
  function nucli(t) {
    if (NOM[t]) return NOM[t];
    if (t.includes(' · ')) t = t.split(' · ').map((x) => NOM[x] || x).join(' · ');
    return frases(t);
  }
  A.traduirCa = function (s) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    return m[2] ? m[1] + nucli(m[2]) + m[3] : s;
  };
  function recorrer(arrel) {
    if (arrel.nodeType === 3) { const t = A.traduirCa(arrel.nodeValue); if (t !== arrel.nodeValue) arrel.nodeValue = t; return; }
    const w = document.createTreeWalker(arrel, NodeFilter.SHOW_TEXT);
    const nodes = []; let n;
    while ((n = w.nextNode())) nodes.push(n);
    for (const x of nodes) { const t = A.traduirCa(x.nodeValue); if (t !== x.nodeValue) x.nodeValue = t; }
  }
  // tradueix l'informe i el que s'hi afegeixi després (gràfics, finestretes d'ajuda)
  A.catala = function (doc) {
    recorrer(doc);
    const obs = new MutationObserver((ms) => {
      if (!doc.isConnected) { obs.disconnect(); return; }
      for (const m of ms) {
        if (m.type === 'characterData') recorrer(m.target);
        else for (const x of m.addedNodes) recorrer(x);
      }
    });
    obs.observe(doc, { childList: true, subtree: true, characterData: true });
  };
})(window.APP);

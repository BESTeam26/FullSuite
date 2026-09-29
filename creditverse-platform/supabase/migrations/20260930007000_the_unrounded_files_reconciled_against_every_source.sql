-- The 192 unrounded files, reconciled against every imported source.
--
-- Dee, 2026-09-30: "Run a deeper reconciliation against EVERYTHING we
-- imported from ClickUp… If trustworthy: populate Current Round, convert to
-- the corresponding Round N Sent. If conflicting: Needs Review. If truly
-- absent: keep In Dispute Mailed, flag Round Unknown… Do not infer from
-- sequence alone."
--
-- Sources, in precedence: the card's Current Round custom field; the card's
-- title and description (read inside the Edge Function, dropped there); the
-- comments already imported. Patterns: "Round 2", "round #2", "R2". A range
-- ("rounds 1-4") names no single round. Two different rounds across sources
-- is a conflict, never a choice.
--
--   automatically resolved : 9   (R1 6, R2 2, R3 1)
--   conflicting            : 3
--   genuinely unknown      : 180
--
-- The unknown keep "In Dispute Mailed" — true — and are flagged
-- `needs_review` with a tagged note, the flag the Client Directory already
-- counts and filters on. Tags are idempotent: rerunning adds nothing.
--
-- Cost impact: none.

begin;

/* ── Resolved ─────────────────────────────────────────────────────────── */
do $$
declare r record; v_round text; v_status text; v_prev text; v_n int := 0;
begin
  for r in select * from (values
      ('64449a8a-8759-43ba-80bc-a1752ef13fc5'::uuid, 1, 'notes', 'Esbon Gumbs'),
      ('0b3ba3ad-92b4-4763-a7c1-aa9b1f35af24'::uuid, 1, 'card text', 'Christian Rios'),
      ('368bb3f4-d089-4467-af83-d90b0adc454c'::uuid, 2, 'card text', 'Anjdrea Garnett'),
      ('8a78c285-2f3c-4ce6-9cbf-8bf8f31bc87e'::uuid, 1, 'notes', 'Douglas Richardson'),
      ('c42c5d86-26c7-43b0-92cd-182df95183f6'::uuid, 1, 'notes', 'Johnny Havior Jr.'),
      ('7303751e-c2d5-447e-be47-38e4ef2f6f01'::uuid, 1, 'notes', 'Kayla Slappy'),
      ('523c33f8-91bd-4fb1-b093-c4b12a3861a5'::uuid, 3, 'notes', 'Quavez Hill'),
      ('931ccddf-6d59-46a4-84d9-b4fd6369d60a'::uuid, 1, 'notes', 'Parker Cathcart'),
      ('3500bfa8-4be1-4e90-acd0-18e6087fb458'::uuid, 2, 'notes', 'Latoya Judie')
    ) as t(client_id, n, source, expect_name)
  loop
    v_round  := case when r.n = 4 then 'Round 4+' else 'Round ' || r.n end;
    v_status := 'Round ' || r.n || ' Sent';
    if not (v_status = any(enum_range(null::public.fulfillment_client_status)::text[])) then
      raise exception 'no status "%" — refusing', v_status;
    end if;
    select c.status::text into v_prev from public.fulfillment_clients c
     where c.id = r.client_id and c.name = r.expect_name;
    if v_prev is null then
      raise exception 'client % (%) not found by id AND name — evidence would land on the wrong file', r.expect_name, r.client_id;
    end if;
    if v_prev <> 'In Dispute Mailed' then
      raise notice 'client % is now "%" — already moved on, skipped', r.expect_name, v_prev; continue;
    end if;
    update public.fulfillment_clients
       set status = v_status::public.fulfillment_client_status,
           round  = v_round::public.fulfillment_round, updated_at = now()
     where id = r.client_id;
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    select c.agency_id, c.organization_id, 'fulfillment_client', c.id::text, null, 'ClickUp reconciliation',
           'Data import',
           'Round established from ' || r.source || ' during the ClickUp reconciliation of 2026-09-30. Not set by an agent.',
           'status', v_prev, v_status, 'bes_internal'
      from public.fulfillment_clients c where c.id = r.client_id;
    v_n := v_n + 1;
  end loop;
  raise notice '% files now say which round is out', v_n;
end $$;

/* ── Conflicts ────────────────────────────────────────────────────────── */
update public.clients c
   set needs_review = true,
       review_note = case when coalesce(c.review_note,'') like '%[round conflict]%' then c.review_note
                          else concat_ws(E'\n', nullif(c.review_note,''),
                               '[round conflict] ClickUp sources name different rounds (' || v.seen || '). Left on In Dispute Mailed; a person must decide.') end
  from (values
      ('efae3eb0-2fc7-4d19-8122-90c2c340740c'::uuid, '1,2', 'James Wilkerson'),
      ('af7229de-58aa-4198-9eb1-adbad5e7e26e'::uuid, '2,6', 'Antavious Walls'),
      ('f24af877-b5b5-428a-a957-3991d68a1aba'::uuid, '2,6', 'Arshay Jones')
    ) as v(fc_id, seen, expect_name)
  join public.fulfillment_clients fc on fc.id = v.fc_id and fc.name = v.expect_name
 where c.id = fc.client_id;

/* ── Unknown ──────────────────────────────────────────────────────────── */
update public.clients c
   set needs_review = true,
       review_note = case when coalesce(c.review_note,'') like '%[round unknown]%' then c.review_note
                          else concat_ws(E'\n', nullif(c.review_note,''),
                               '[round unknown] No round recorded anywhere in the ClickUp import (field, card text, notes). Left on In Dispute Mailed.') end
  from (values
      ('4e61387a-e5e0-4ae3-8148-25020a32c358'::uuid, 'Anthony Brannon'),
      ('a8de913d-6f84-4db1-a33c-b08d9dc4db50'::uuid, 'Carlos Miguel Baez Jr.'),
      ('1854d376-e421-4513-8da8-bad4d0ec541f'::uuid, 'Danielle Angela Stallone'),
      ('ceb9f095-c737-4c0c-a1f6-0bf6c89672fc'::uuid, 'Derrick Calhoun'),
      ('47f402ed-bc2c-45ef-a92d-152cf8ab82c3'::uuid, 'Eric Moreno Olivarez'),
      ('8617c738-bd00-4c3f-acd0-8c4a06dadd13'::uuid, 'Jasmine Lee'),
      ('e6eac4a2-8a04-428a-b72d-b32c20e370cd'::uuid, 'Kerry Dessource'),
      ('f8c8f4a4-7a60-427a-b8ed-16793e8c9ae6'::uuid, 'Kiersten Kerr'),
      ('626d678f-b631-413b-aded-88a2c8399039'::uuid, 'Lamika Williams'),
      ('1eeebe95-ae9f-4730-a2e3-ed90417b62de'::uuid, 'Reginald Funchess'),
      ('d64f0bfa-6856-45e6-aebe-498d4963b30c'::uuid, 'Ryan Melton'),
      ('916ff52d-db7d-49e0-9c6b-1f796cc8d75f'::uuid, 'Thomas Fields Jr'),
      ('b1fc1392-0ed0-4921-9521-94e1949fae0c'::uuid, 'Tiffini Success'),
      ('030a0a7e-f978-4772-a64d-306141294039'::uuid, 'Andy Prospere'),
      ('36fb1d84-2f1e-402e-bc41-50ede2d7d670'::uuid, 'Angela Robinson'),
      ('163ec871-61c0-4b14-a3c4-65a0a1979020'::uuid, 'Jean Joseph'),
      ('9cd6bd97-0520-4c5d-88e4-c88d70a51315'::uuid, 'Marcus Charles'),
      ('d5eda2a9-cafb-4a4d-922b-798742db72bc'::uuid, 'Romane Gelin'),
      ('1571756d-9eac-402d-9d44-d11199188b8a'::uuid, 'Tierail Millings Jr.'),
      ('940c0835-7496-4765-853c-ec578a5f3797'::uuid, 'Alisha Foster'),
      ('ef1e1208-db39-43cc-bb0c-63baf8c1fc85'::uuid, 'Annmarie Scott'),
      ('8a49afc2-0a33-4b09-a5f0-c99f5f3f7d5d'::uuid, 'Dario Calderon'),
      ('255a78a8-bdd6-41b2-81a3-b86010a46d5d'::uuid, 'Isaiah Haynes'),
      ('d8668bc3-afc7-4c7b-8b09-8d744565bbd0'::uuid, 'Latoya Daniel'),
      ('9ac55b4c-9223-42e8-96e8-05a1bbfa7af9'::uuid, 'Adam Vallejos Jr.'),
      ('f51f1512-b0b9-4ea1-8d90-95526628c69c'::uuid, 'Ajaypreet Singh'),
      ('50aa54ef-7d45-48e7-8748-ac7ae8080d93'::uuid, 'Alexandra Rosa Sepulveda'),
      ('e3f16d0c-9310-40e0-9f4a-2d5eff9fc112'::uuid, 'Ana Valenzuela'),
      ('534e465b-b23e-47af-bc70-c4e23a1270c4'::uuid, 'Bethany Aguirre'),
      ('f12123f8-9426-4898-b843-01646599e9c1'::uuid, 'Cain Ezrre'),
      ('01b294b6-d54a-4a97-9a3a-f6e103f0df72'::uuid, 'Chantel Acuna'),
      ('23bae3ac-b6ee-4528-9a7c-7fddef5f560d'::uuid, 'David Ceja Jr.'),
      ('1675bf6f-f539-4b68-a993-7e203c66b93d'::uuid, 'Deanna Moeung-Dy'),
      ('38ba2a8e-fc44-48c9-8216-950e077cc589'::uuid, 'Elias Garza'),
      ('059325f5-de18-461c-b958-f6d4c939ec42'::uuid, 'Emma Massey'),
      ('42932e78-2fa7-4da5-af6a-d0b0bb397864'::uuid, 'Ingrid Aguirre'),
      ('92c90880-fcc9-429f-a0e5-ea6a3cb3e64d'::uuid, 'Jansen King'),
      ('844fe86e-1203-4f85-a106-33bfa91d447a'::uuid, 'Jesus Sencion'),
      ('68fc16f8-9ca7-4944-9c56-c5f1c14cfed4'::uuid, 'John Maina'),
      ('82735f3f-21dd-4399-a9bf-6ea4ce6c665c'::uuid, 'Joshua Barnett'),
      ('28d0b2c2-959f-409e-8ad6-a58565f203af'::uuid, 'Luis  Esqueda-Ledesma'),
      ('3a0f54e6-60fb-4f48-882f-ce6c6fe4a984'::uuid, 'Manuel De Sousa -Tromp'),
      ('acc94169-6767-475a-8913-bcf1e2a3e2c8'::uuid, 'Nancy Espino'),
      ('66d8ed0b-9f87-4b61-93d6-eabb44aa46d3'::uuid, 'Olivia Dupon'),
      ('b182f401-dd60-4a1a-8540-fe78856b45b0'::uuid, 'Omar Martinez-Velazquez'),
      ('7e45627b-bba5-4269-bad3-ee6fbecc8936'::uuid, 'Sergio Valencia Jr.'),
      ('8559ecfa-bfb3-44be-840e-6dd53c7bc9d6'::uuid, 'Sharon Regala'),
      ('122096e3-3658-4a59-851c-97fac1a96145'::uuid, 'Thomas Cavanagh Jr.'),
      ('1fd5e30e-e0c7-41d8-8dd4-1f611bd430ea'::uuid, 'Toby Chan'),
      ('0818e076-310c-4ae9-bfc7-e5e77e97ee1c'::uuid, 'Arthur Washington Jr.'),
      ('bc23e59c-6642-43bd-947a-00b22029d0a7'::uuid, 'Brian Twaites-Creech'),
      ('773f1b9f-f247-48bc-b9fa-ffb98e027ff5'::uuid, 'Charles Witherspoon II'),
      ('481d8797-7421-4e17-98c1-a1f612e20eb1'::uuid, 'Christian Urquiza'),
      ('76001dbf-53e6-451e-b9e3-8b99c116e4a7'::uuid, 'Cristian Garcia-Gutierrez'),
      ('9b9c91a9-787d-4c90-a6b8-7f519206fc65'::uuid, 'Elijah Brown'),
      ('ff9a7ae1-c720-40f1-b2b4-da521fd6d348'::uuid, 'Fidencio Perez'),
      ('54f03ff1-5894-45c2-8cdd-efe3ee7dcd6c'::uuid, 'Hikmal Nassery'),
      ('ff1df6c8-1015-4d94-b3fe-e1351761ed8b'::uuid, 'Jessica Velasco'),
      ('8cafea5d-7410-4eac-9235-628a8ddd6307'::uuid, 'Jesus Saldivar Jr.'),
      ('5f9d87ac-a5ea-497b-89fd-37053eecaabf'::uuid, 'Jose Flores'),
      ('d7c0a7e9-c3cc-4777-8bbb-da35792172f1'::uuid, 'Joshua Jones'),
      ('12eabca9-6e8a-4451-95a1-8ab6f5106971'::uuid, 'Josue Jack Ruvalcaba-Garcia'),
      ('b1f57b9b-613c-44a3-b8c9-2d692ece9510'::uuid, 'Jovanny Guillen'),
      ('6ab98a2c-ef4b-4b9e-9641-649e1798b453'::uuid, 'Julio Sanchez-Sanchez'),
      ('e464325b-a6a6-40b1-8e70-0e13bd557582'::uuid, 'Kyleigh Whitley'),
      ('351a43d3-b4a3-4d60-bea7-e9f9985ac9a9'::uuid, 'Lionardo Hernandez-Mendoza'),
      ('862c4e9b-c160-4d8f-8c13-4d54543a1ad8'::uuid, 'Lisett Gonzalez'),
      ('0eb3b1bc-6445-4bfe-914a-0615c6889179'::uuid, 'Manuel Rivas'),
      ('c1a87bb6-7fd6-4257-b418-5029b84e9da2'::uuid, 'Maria Fuoco'),
      ('d997e589-2d68-4e7f-ba66-f9ed206e64ff'::uuid, 'Matthew Valentine'),
      ('70c2d4b3-bc16-42a5-ae39-1cfc7cf6fbc5'::uuid, 'Melissa Berta'),
      ('de40f000-5a96-48ef-a3e7-448e591424c4'::uuid, 'Michaela Roman'),
      ('087a77e1-26ea-443a-ac82-25608bf2707e'::uuid, 'Pedro Valerio-Toribio'),
      ('b20aeecd-27a9-4d3e-a0f5-27427671cb25'::uuid, 'Richard Holman'),
      ('300ee051-b5d1-454e-9ad1-6224234f5a88'::uuid, 'Rosemane Dagobert'),
      ('6b57aa17-1c88-48bd-b1ab-4928a4570dba'::uuid, 'Samuel Valencia-Gonzalez Jr'),
      ('3f6b0f66-e59b-42fd-8ebb-01788f97e7f7'::uuid, 'Samuelu Angelo Vele'),
      ('53363b13-fa19-4750-a2fd-3a9a92e435fe'::uuid, 'Taquisha Falcon'),
      ('c819849a-9f64-4280-bac3-894ac306a892'::uuid, 'Vanessa Valencia'),
      ('783466ac-01a0-4664-a118-7ce55dd63473'::uuid, 'Victoria Baker'),
      ('51451b36-2988-40a7-aed5-01aed9fe53fe'::uuid, 'Yadhira Zuniga-Miranda'),
      ('b1d8d7ed-6432-4bbb-bb7c-db01de194e51'::uuid, 'Zarnee Chang'),
      ('197a459a-2e99-45c2-a029-9c94dafaefe8'::uuid, 'Paresh Padalia'),
      ('4a155aee-9687-493a-adde-b425ca9b271d'::uuid, 'Xingcan Li'),
      ('fd6e4f14-28e4-4814-b16c-e86c867df26b'::uuid, 'Xiwen Zheng'),
      ('7ffdce8b-6e1d-4fc3-b893-3d57061afac3'::uuid, 'Byng Bennett II'),
      ('861055d2-a3a0-4f53-9343-16d92b601072'::uuid, 'Dalvert Ventura'),
      ('b5c6299d-e559-4786-b5cd-8b80d84de55b'::uuid, 'Deshawn Felipa'),
      ('fc0b1940-ac9b-4258-96c8-665442f00aba'::uuid, 'Elba Hernandez'),
      ('912d0241-9304-4c2b-b124-9e8088105944'::uuid, 'Luchy Vasquez Soto'),
      ('59d25231-e96f-4cd8-bc65-f16c9f5aa260'::uuid, 'Maria Ecolastico'),
      ('82351561-8777-4385-ae6e-1d5e55d77e28'::uuid, 'Maximo Estrella Jr'),
      ('6bb1e5ca-be12-465d-8acb-9fbbce09cf92'::uuid, 'Melanie Ramirez-Fernandez'),
      ('adab07c2-5b2d-4f5e-8a30-409bd71fd986'::uuid, 'Sterlin Cadet'),
      ('feac9e6a-b867-46b2-92ac-e392faaba5d8'::uuid, 'Abrahan Vinageras'),
      ('9265d868-7069-4ba3-8853-3e7ccd92f733'::uuid, 'Genaro Perez'),
      ('868e309c-ee15-4026-933a-6cc0ecd08a82'::uuid, 'Paulette Lam'),
      ('38c9dbcb-e8a4-4f79-ae02-91c83c883ec5'::uuid, 'Raydel Baez'),
      ('a9dfa6b3-a3f8-4fee-8dde-acbc89e62407'::uuid, 'Alexandria Wells'),
      ('5af4e80a-1433-4441-8e4d-81e36fe4fc3d'::uuid, 'Cedrick Harper'),
      ('d38c6e6e-5314-4ed4-8b43-0cd578b0e6c3'::uuid, 'Gabrielle Emory'),
      ('d4be5f86-7aea-44de-914b-6e33b0354eef'::uuid, 'Ishmael Jackson'),
      ('f1b41f9d-8e39-4b93-9e59-05180a0ad295'::uuid, 'Rukia Havior'),
      ('4e97c4bb-8b54-4984-b4b5-bf0112f20fb3'::uuid, 'Tyler Thomas'),
      ('730d76d0-e15b-40de-8146-78c697e5e0a5'::uuid, 'Beatriz Jimenez'),
      ('17626ee0-4c8f-45bb-abb6-80b724cf139e'::uuid, 'Dayana Azcona'),
      ('054d13e8-13e9-4aac-997b-ad5d94a1b1e8'::uuid, 'Daquaz Parker'),
      ('29d7ab09-8a50-47a3-af01-0b757a50235a'::uuid, 'Margaret Bagrowski'),
      ('e827e3da-bbb6-468d-ba81-0d034fcc9a3a'::uuid, 'Michael Le'),
      ('10fb1060-7e56-4970-8e35-091c587ee3ed'::uuid, 'Michael Le Jr.'),
      ('cfc9df52-d913-4d05-a352-f511d8b7c591'::uuid, 'Ryan Marchese'),
      ('724af877-2ed0-4918-9a59-1c38166811b4'::uuid, 'Victoria Camacho'),
      ('4d6d240b-727e-4396-bbdb-afc47b08a855'::uuid, 'Robert Andres'),
      ('93f7df52-244b-41f9-845a-0df841630bca'::uuid, 'D''Asia Shawntese Smith'),
      ('cfe172d9-ba95-45f8-a52c-d1e620729667'::uuid, 'Daevon Byrdie'),
      ('2c5e30a9-99f1-4908-b7a8-2124956aed3c'::uuid, 'Erin Norman'),
      ('4639d485-edda-437f-a1d6-1bbdba136fd5'::uuid, 'Tarik Smith Jr.'),
      ('8ae4734e-c577-4bd2-ba3a-7e40e366c5e0'::uuid, 'Zachary Pierce'),
      ('bc9dfc6f-e8c8-4dfe-a273-2109ee7e1015'::uuid, 'Abraham Rodriguez-Rios'),
      ('ad854b6e-0699-4285-a761-8b09de72d1fa'::uuid, 'Aida Mora'),
      ('aa9d15c0-e1e6-4bbc-a26d-22928b289664'::uuid, 'Alberto Pamplona-Cardenas'),
      ('30d65d5d-398f-4362-888a-aede287d35b6'::uuid, 'Alberto Perez Jr'),
      ('782372b5-e91c-4eba-acc2-8abf0f07eb74'::uuid, 'Alexander Robinson'),
      ('2164d8c5-9411-47a5-8ab0-a9c912896d35'::uuid, 'Andres Jimenez Rivera'),
      ('4d620587-c6fd-494b-b778-a9554ad48e25'::uuid, 'Andrew Rodriguez'),
      ('0d078e50-48d6-4360-8637-5c110ff11e3c'::uuid, 'Aylin Carranza'),
      ('c3c656ed-16ce-47f4-b076-6deebc1d20e6'::uuid, 'Brandon Pascal'),
      ('5ebea89e-58ba-47d5-b6c8-78f890ac5ea0'::uuid, 'Brenda Avendano'),
      ('36e62020-42f5-497d-b29f-48996814fd7d'::uuid, 'Brian Santiago'),
      ('5e173c59-93a2-4e30-9976-fc48d0206577'::uuid, 'Caitlyn Spina'),
      ('bfa6d1c8-c8d9-443e-aabe-e23e9ec4d769'::uuid, 'Christian Soto'),
      ('51c42178-8cbe-485f-8b03-a5d69496d3da'::uuid, 'Clemente Gutierrez'),
      ('73182561-7fe6-4e25-a58a-82785c04c92a'::uuid, 'Cynthia Razura'),
      ('24d590cc-030d-4854-b560-a68a0f639ccc'::uuid, 'Daniel Vasquez'),
      ('6f36db9f-4222-4a65-8616-79f86bdec606'::uuid, 'Donna Flores'),
      ('e8093bb1-639c-4ece-8f2b-ad054e727ba2'::uuid, 'Elizabeth Garcia'),
      ('bcef5cf9-e212-4c00-aa9b-2d7f649e715a'::uuid, 'Eric Khachomian'),
      ('0c4f73b1-cccd-4f17-b383-3645e007348b'::uuid, 'Erick Vega'),
      ('fdd1eb0f-1b9d-4df4-a961-ad7129fbace5'::uuid, 'Farzad Rashedi'),
      ('fca1366c-960a-4fab-8f52-b540aa6342ef'::uuid, 'Francisco Garcia'),
      ('ba5ac683-98b9-43a0-9343-0e7ca40e88ff'::uuid, 'Francisco Sotelo'),
      ('c3721e27-cc7e-4aeb-82b5-0effbd4707d1'::uuid, 'Gabriela Cardenas'),
      ('1e34dff4-83cd-4971-92ad-d7676ed9139a'::uuid, 'Gisselle Perez'),
      ('df6a5f15-707d-4e83-bb7e-1af8a8eb5965'::uuid, 'Gladys Juarez'),
      ('3cff2b1b-9aa0-4c63-b084-7e2af07c117f'::uuid, 'Hugo Alvarado-Galvez'),
      ('15333370-68c8-4fa7-bfda-8edf2fa050c9'::uuid, 'Jasmine Smith'),
      ('a643590d-031e-457a-8423-d3c8c3fa3c1a'::uuid, 'Javier Cervantes'),
      ('0f0fdb1f-391c-429b-8aa6-382de81bcd8a'::uuid, 'Jay Gray'),
      ('2b000319-7545-4e5c-8f0d-148a450d1a8f'::uuid, 'Jeans Louissant'),
      ('93132c5b-23e3-4969-bf0b-3cdbe3c2f5a2'::uuid, 'Jerry Proano'),
      ('a0e5a1fa-c6a1-4e97-a69c-2dc081ba392e'::uuid, 'Jonathan Ortega'),
      ('07f28695-1a5a-4c5d-be35-428e16e1debc'::uuid, 'Juan Garcia'),
      ('20936407-f804-4a49-b5f4-ef697d4448cc'::uuid, 'Kenneth Orellana'),
      ('386d7670-3cb0-4b9d-871c-9ddfd31c9b74'::uuid, 'Kevin Del Cid-Contreras'),
      ('2c2fba60-500d-402a-b9c9-fa2d5ccb0a00'::uuid, 'Kimberly Alfaro'),
      ('43c52128-01e7-4701-8a37-ad53b520773a'::uuid, 'Luis Linares-Galicia'),
      ('9ae41cfa-f741-4ffc-87a1-90c0d45f5dac'::uuid, 'Malcolm Cole'),
      ('9368f0d2-55c6-4250-b976-c3236a55df16'::uuid, 'Maria Salgado'),
      ('d218aab4-426a-4c39-81c5-f8dc7d948e3e'::uuid, 'Marielena Lemus'),
      ('d218aab4-426a-4c39-81c5-f8dc7d948e3e'::uuid, 'Marielena Lemus'),
      ('22ef1af9-3513-4322-9e84-b9a602a53c1b'::uuid, 'Miguel Rico'),
      ('139a0c29-02df-4819-bd5d-00f19f088d4c'::uuid, 'Miguel Vejar Jr'),
      ('ab8fc19c-830b-4751-bf62-50fdb101687f'::uuid, 'Nevaeh Odom'),
      ('2e0c87a3-14c2-4573-bc11-fb4de66e477a'::uuid, 'Paulo Aparicio'),
      ('8a7da023-8d01-466a-a3e1-d14385b4427f'::uuid, 'Rafael Carrillo'),
      ('276071b3-76c9-4674-a4ad-712b1e6cd207'::uuid, 'Raul Escalante'),
      ('18024530-9a14-4cc9-b028-88c93aed16c2'::uuid, 'Reyna Salazar'),
      ('3e523ad1-21b7-4ace-83b0-adb4ceff4b41'::uuid, 'Reynaldo Tabuyo Jr.'),
      ('e4614e55-89a3-4d84-b285-3482a72bc885'::uuid, 'Ricardo Urzua'),
      ('8c59c92c-fbea-40ff-b57f-ae05b963f3de'::uuid, 'Stephanie Sarkisian'),
      ('c9bde9b6-ba90-438f-b3d2-a4ecdf2c274a'::uuid, 'Tameca Bryant'),
      ('ab2ad831-8c4f-47e4-aa77-b051d701e15c'::uuid, 'Tanya Rulloda'),
      ('00b59b5d-03f4-4e19-bc84-a409c4ed855d'::uuid, 'Tolu Omokehinde'),
      ('b66c0bb5-fdb3-41ab-81a4-b7478f340f26'::uuid, 'Ulises Romero Ramirez'),
      ('559c0015-75e1-41f6-b98f-039febab605e'::uuid, 'Viviana Fuentes-Delgado'),
      ('7a66b75e-02ff-4071-8f05-8411d40177f5'::uuid, 'William Cevallos '),
      ('71708d38-c5f1-4ab0-b31a-327f9c2f07ef'::uuid, 'William Segura'),
      ('e1c7e82c-972b-4c57-b503-fb55105bebe1'::uuid, 'William Winton'),
      ('e664ff27-e57a-4dd0-bd3e-fdbea3c472e2'::uuid, 'David Fletcher'),
      ('99ae8f02-c7db-4367-b24a-4be9ab6c0f0b'::uuid, 'Lee Ernest Burns III')
    ) as v(fc_id, expect_name)
  join public.fulfillment_clients fc on fc.id = v.fc_id and fc.name = v.expect_name
 where c.id = fc.client_id;

/* Nothing became actionable, and the flags landed. */
do $$
declare v_wrong int; v_flagged int;
begin
  select count(*) into v_wrong from public.fulfillment_clients fc
    join public.client_department_statuses s on s.client_id = fc.id
   where fc.status::text ~ '^Round \d+ Sent$' and s.department = 'Dispute'
     and public.creditops_status_is_actionable(s.department, s.status);
  if v_wrong > 0 then raise exception '% mailed rounds became actionable', v_wrong; end if;
  select count(*) into v_flagged from public.clients where needs_review and review_note like '%[round %';
  raise notice '% canonical clients flagged for round review', v_flagged;
end $$;

commit;

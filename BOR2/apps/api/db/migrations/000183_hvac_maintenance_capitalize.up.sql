-- Endereços e nomes vieram da planilha com palavras em minúscula; o cartão
-- mostra o endereço como título. Primeira letra de cada palavra em maiúscula.
-- Ficam como estão os conectivos de nome ("and", "e"). O "9 ingalls village
-- way, boxford" perde o ", boxford" repetido: a cidade já está em city.
UPDATE hvac_maintenance_contracts SET address = '09 Plimpton Farm Rd' WHERE address = '09 plimpton farm rd';
UPDATE hvac_maintenance_contracts SET address = '1109 Codman Way' WHERE address = '1109 codman way';
UPDATE hvac_maintenance_contracts SET address = '13 Ingalls Village Way' WHERE address = '13 Ingalls Village way';
UPDATE hvac_maintenance_contracts SET address = '141 Phoebe St' WHERE address = '141 Phoebe st';
UPDATE hvac_maintenance_contracts SET address = '15 Stillwater' WHERE address = '15 stillwater';
UPDATE hvac_maintenance_contracts SET address = '165 Baxter Neck' WHERE address = '165 Baxter neck';
UPDATE hvac_maintenance_contracts SET address = '2 Winslow Lane, Unit 406' WHERE address = '2 Winslow Lane, unit 406';
UPDATE hvac_maintenance_contracts SET address = '2 Winslow Lane Unit 301' WHERE address = '2 Winslow lane unit 301';
UPDATE hvac_maintenance_contracts SET address = '22 Lois Ann Court' WHERE address = '22 lois ann court';
UPDATE hvac_maintenance_contracts SET address = '38 Oak Hill St' WHERE address = '38 oak hill st';
UPDATE hvac_maintenance_contracts SET address = '45 Thelma Way' WHERE address = '45 thelma way';
UPDATE hvac_maintenance_contracts SET address = '48 Phoebe St' WHERE address = '48 Phoebe st';
UPDATE hvac_maintenance_contracts SET address = '51 West Way' WHERE address = '51 west way';
UPDATE hvac_maintenance_contracts SET address = '59 Taft Ave' WHERE address = '59 taft ave';
UPDATE hvac_maintenance_contracts SET address = '66 Kestrel Heights' WHERE address = '66 kestrel heights';
UPDATE hvac_maintenance_contracts SET address = '7 Dogwood Drive' WHERE address = '7 Dogwood drive';
UPDATE hvac_maintenance_contracts SET address = '75 Foundry Lane' WHERE address = '75 foundry lane';
UPDATE hvac_maintenance_contracts SET address = '75 Ingalls Village Way' WHERE address = '75 ingalls village way';
UPDATE hvac_maintenance_contracts SET address = '8 Richardson Drive' WHERE address = '8 richardson drive';
UPDATE hvac_maintenance_contracts SET address = '81 Ingalls Village Way' WHERE address = '81 ingalls village way';
UPDATE hvac_maintenance_contracts SET address = '9 Ingalls Village Way' WHERE address = '9 ingalls village way, boxford';
UPDATE hvac_maintenance_contracts SET client_name = 'Debra Merril' WHERE client_name = 'Debra merril';

-- The order Dee's chart lists the CreditOps units in, under each department.
update public.departments set sort = 1 where division = 'creditops' and key = 'dispute';
update public.departments set sort = 2 where division = 'creditops' and key = 'complaints';
update public.departments set sort = 3 where division = 'creditops' and key = 'bureau_calling';
update public.departments set sort = 1 where division = 'creditops' and key = 'onboarding';
update public.departments set sort = 2 where division = 'creditops' and key = 'support';

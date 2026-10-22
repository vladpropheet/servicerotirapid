-- Rulează o singură dată, la prima pornire a containerului Postgres.
-- Baza de teste e separată, ca testele automate să nu atingă datele de dezvoltare.
CREATE DATABASE servicerotirapid_test;

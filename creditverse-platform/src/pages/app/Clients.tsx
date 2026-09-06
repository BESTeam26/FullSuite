/**
 * Clients.
 *
 * One list: the organization's own, from the database. This page used to fall
 * back to a hand-written roster of fictional clients — with invented statuses,
 * rounds and billing figures — whenever the session was not live. That has
 * been deleted rather than labelled: a demonstration made of invented people
 * demonstrates nothing, and it is too easy to mistake for real work.
 */
import { LiveClientsList } from "@/components/clients/LiveClientsList";

const Clients = () => <LiveClientsList />;

export default Clients;

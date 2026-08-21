import { Knex } from 'knex';

/** Adds an optional WhatsApp contact number to users, separate from phone_no. */
export async function up(knex: Knex): Promise<void> {
  const hasWhatsappNo = await knex.schema.hasColumn('users', 'whatsapp_no');
  if (hasWhatsappNo) return;

  await knex.schema.alterTable('users', (t) => {
    t.string('whatsapp_no', 20).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasWhatsappNo = await knex.schema.hasColumn('users', 'whatsapp_no');
  if (!hasWhatsappNo) return;

  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('whatsapp_no');
  });
}

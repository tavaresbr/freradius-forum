const db = require("../db");

async function migrate() {
  console.log("Migration 006: Adicionando portal_id na tabela mikrotiks...");

  try {
    // Verificar se coluna já existe
    const [columns] = await db.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mikrotiks' AND COLUMN_NAME = 'portal_id'"
    );

    if (columns.length === 0) {
      await db.execute(
        "ALTER TABLE mikrotiks ADD COLUMN portal_id INT DEFAULT NULL"
      );
      console.log("  + Coluna portal_id adicionada em mikrotiks");

      // Adicionar FK para portais
      try {
        await db.execute(
          "ALTER TABLE mikrotiks ADD CONSTRAINT fk_mikrotik_portal FOREIGN KEY (portal_id) REFERENCES portais(id) ON DELETE SET NULL"
        );
        console.log("  + FK fk_mikrotik_portal criada");
      } catch (fkErr) {
        console.warn("  ! FK não criada (pode já existir):", fkErr.message);
      }
    } else {
      console.log("  = Coluna portal_id já existe em mikrotiks");
    }

    console.log("Migration 006 concluída.");
    process.exit(0);
  } catch (err) {
    console.error("Erro na migration 006:", err);
    process.exit(1);
  }
}

migrate();

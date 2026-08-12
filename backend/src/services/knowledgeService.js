const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

class KnowledgeService {
  constructor() {
    this.knowledgeBase = {};
    this.loadKnowledgeBase();
  }

  loadKnowledgeBase() {
    const knowledgePath = path.join(__dirname, "..", "..", "..", "..", "knowledge_base");
    if (!fs.existsSync(knowledgePath)) {
      logger.warn("Knowledge base directory not found:", knowledgePath);
      return;
    }

    const files = fs.readdirSync(knowledgePath);
    for (const file of files) {
      if (file.endsWith(".txt")) {
        const filePath = path.join(knowledgePath, file);
        const content = fs.readFileSync(filePath, "utf8");
        this.knowledgeBase[file.replace(".txt", "")] = content;
        logger.info(`Loaded knowledge file: ${file}`);
      }
    }
    logger.info(`Knowledge base loaded with ${Object.keys(this.knowledgeBase).length} entries.`);
  }

  getKnowledge(key) {
    return this.knowledgeBase[key];
  }

  getAllKnowledge() {
    return this.knowledgeBase;
  }

  getRelevantKnowledge(query, frameworks = []) {
    let relevantContent = "";
    const allKnowledge = this.getAllKnowledge();

    // Prioritize specific frameworks if requested
    if (frameworks.length > 0) {
      for (const framework of frameworks) {
        const content = allKnowledge[framework];
        if (content) {
          relevantContent += `\n\n--- ${framework} ---\n${content}`; 
        }
      }
    }

    // Fallback to general search if no specific frameworks or if more context is needed
    if (!relevantContent) {
      // Simple keyword-based relevance for now. Can be enhanced with NLP/embedding search.
      for (const key in allKnowledge) {
        if (allKnowledge[key].toLowerCase().includes(query.toLowerCase())) {
          relevantContent += `\n\n--- ${key} ---\n${allKnowledge[key]}`;
        }
      }
    }

    return relevantContent.trim();
  }
}

module.exports = new KnowledgeService();

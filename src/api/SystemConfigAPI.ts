const emptyResponse = (data: any = []) => ({data: data ?? [], status: 200});

const SystemConfigAPI = {
  getActiveDomains: async () => emptyResponse([]),
  getAllDomains: async () => emptyResponse({content: []}),
  createDomain: async () => ({data: null}),
  updateDomain: async () => ({data: null}),
  deleteDomain: async () => ({data: null}),

  getKnowledgeByDomainId: async () => emptyResponse([]),
  getAllKnowledge: async () => emptyResponse({content: []}),
  createKnowledge: async () => ({data: null}),
  updateKnowledge: async () => ({data: null}),
  deleteKnowledge: async () => ({data: null}),

  getSchemesByKnowledgeId: async () => emptyResponse([]),
  getAllSchemes: async () => emptyResponse({content: []}),
  createScheme: async () => ({data: null}),
  updateScheme: async () => ({data: null}),
  deleteScheme: async () => ({data: null}),

  getLevelsByKnowledgeId: async () => emptyResponse([]),
  getLevelsBySchemeId: async () => emptyResponse([]),
  getAllLevels: async () => emptyResponse({content: []}),
  createLevel: async () => ({data: null}),
  updateLevel: async () => ({data: null}),
  deleteLevel: async () => ({data: null}),
};

export default SystemConfigAPI;

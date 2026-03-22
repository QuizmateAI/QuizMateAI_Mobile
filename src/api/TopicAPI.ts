import api from './api';

const TopicAPI = {
  getTopicsWithDomains: () => api.get('/api/topic/all'),
};

export default TopicAPI;

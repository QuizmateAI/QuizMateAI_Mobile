import api from './api';

const TopicAPI = {
  getTopicsWithDomains: () => api.get('/topics/all'),
};

export default TopicAPI;

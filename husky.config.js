module.exports = {
  hooks: {
    'commit-msg': 'commitlint -E HUSKY_GIT_PARAMS || echo "See: https://github.com/angular/angular/blob/master/CONTRIBUTING.md#-commit-message-guidelines" && exit 1',
  },
};
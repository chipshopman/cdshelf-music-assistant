package Plugins::CDShelf::Plugin;

use strict;
use warnings;

use base qw(Slim::Plugin::OPMLBased);
use Slim::Utils::Log;

my $log = Slim::Utils::Log->addLogCategory({
    category     => 'plugin.cdshelf',
    defaultLevel => 'INFO',
    description  => 'PLUGIN_CDSHELF',
});

sub initPlugin {
    my $class = shift;

    $class->SUPER::initPlugin(
        feed   => \&handleFeed,
        tag    => 'cdshelf',
        menu   => 'apps',
        is_app => 1,
    );

    if (main::WEBUI) {
        require Plugins::CDShelf::Settings;
        Plugins::CDShelf::Settings->new;
    }

    $log->info('CD Shelf plugin 0.7.6 loaded');
}

sub getDisplayName {
    return 'PLUGIN_CDSHELF';
}

sub handleFeed {
    my ($client, $callback, $args) = @_;

    my $player = $client ? $client->id : '';
    my $url = '/plugins/CDShelf/html/index-full-width.html';
    $url .= '?player=' . $player if $player;

    my $feed = {
        name  => 'PLUGIN_CDSHELF',
        items => [
            {
                name        => 'PLUGIN_CDSHELF_OPEN',
                description => 'PLUGIN_CDSHELF_OPEN_DESC',
                type        => 'iframe',
                url         => $url,
            },
        ],
    };

    if ($callback) {
        $callback->($feed);
        return;
    }

    return $feed;
}

1;

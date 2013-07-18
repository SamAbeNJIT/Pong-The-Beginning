#include <SFML/Graphics.hpp>
#include <string>
#include <time.h>
#include <iostream>
#include "Bar.h"
#include "Ball.h"
#pragma once

using namespace std;
using namespace sf;

Bar* bar1;
RenderWindow* window;
Ball* ball1;

int fps = 0;
int startTime = time(NULL);
int endTime = time(NULL)+1;

int screenHeight = 585;
int screenWidth = 585; 
int screenWidth1 = 5;
int screenHeight1 = 5;



void test()
{    
	sf::Image iCharacter;
	iCharacter.loadFromFile("test.png");
}

void init()
{
	window = new RenderWindow(VideoMode(screenWidth, screenHeight), "Pong: The Beginning");

	ball1 = new Ball();
	ball1->velocity.x = 456;
	ball1->velocity.y = 300;
	bar1 = new Bar();
}

void update(float deltaTime)
{
	Vector2f move(0,0);


	if (Keyboard::isKeyPressed(Keyboard::Up))
	
		{
			move.y = move.y - bar1->speed;
		}
	
	if (sf::Keyboard::isKeyPressed(sf::Keyboard::Down))
	
		{
			move.y = move.y + bar1->speed;
		}
	
	bar1->move( move * deltaTime);

	if(ball1->getPosition().y > screenHeight)
	
	{
			if(ball1->velocity.y > 0)
				{
					ball1->velocity.y = -ball1->velocity.y;
				}
	}
		
	if(ball1->getPosition().x > screenWidth )
	
		{
			ball1->velocity.x = -ball1->velocity.x;
		}
	
	ball1->update(deltaTime);

	if(ball1->getPosition().x < screenWidth1 ) 
		
		{
			
		}
	if(ball1->getPosition().y < screenHeight1)
	{
		ball1->velocity.y = -ball1->velocity.y;
	}
	
}

void draw(float deltaTime)
{
	window->clear(sf::Color::Black);

	window->draw(*(ball1->shape));
	window->draw(*bar1->rec);

	window->display();
}

int main()
{
	int selection;

	//get number of players
	cout<<"Welcome to Pang!"<<endl;
	cout<<"1. One player"<<endl;
	cin>>selection;

	if(selection==1)
	{
		cout<<"You have selected one player"<<endl;

	}
	else if(selection==2)
	{
		cout<<"You have selected two players!"<<endl;
	}


	init();
		
	sf::Clock deltaClock;

	while (window->isOpen())
	{
		Time deltaTime = deltaClock.restart();

		//write fps every 1000 frames
		fps++;
		endTime = time(NULL);
		if(fps % 1000 == 0)
			cout << (fps/(endTime-startTime+1)) << endl;

		update(deltaTime.asSeconds());

		draw(deltaTime.asSeconds());

			
	}
}

